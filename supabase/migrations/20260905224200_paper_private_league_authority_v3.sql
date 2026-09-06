begin;

create table if not exists public.paper_private_league_members_v3 (
  competition_id uuid not null references public.paper_competitions_v3(id) on delete restrict,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (competition_id, user_id),
  foreign key (competition_id, user_id)
    references public.paper_competition_entries_v3(competition_id, user_id)
    on delete restrict
);

create unique index if not exists paper_private_league_single_owner_v3
  on public.paper_private_league_members_v3 (competition_id)
  where role = 'owner';

create table if not exists public.paper_private_league_invites_v3 (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.paper_competitions_v3(id) on delete restrict,
  created_by_user_id uuid not null,
  invite_token_hash text not null unique
    check (invite_token_hash = lower(invite_token_hash) and invite_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (competition_id, created_by_user_id)
    references public.paper_private_league_members_v3(competition_id, user_id)
    on delete restrict,
  check (expires_at > created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists paper_private_league_invites_competition_v3_idx
  on public.paper_private_league_invites_v3 (competition_id, created_at desc);

alter table public.paper_private_league_members_v3 enable row level security;
alter table public.paper_private_league_invites_v3 enable row level security;

revoke all on public.paper_private_league_members_v3 from public, anon, authenticated;
revoke all on public.paper_private_league_invites_v3 from public, anon, authenticated;

create or replace function private.enforce_paper_private_league_scope_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  select kind into v_kind
  from public.paper_competitions_v3
  where id = new.competition_id;

  if not found or v_kind <> 'private_league' then
    raise exception 'private league scope invalid';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_paper_private_league_scope_v3() from public, anon, authenticated;

drop trigger if exists paper_private_league_member_scope_v3 on public.paper_private_league_members_v3;
create trigger paper_private_league_member_scope_v3
before insert or update on public.paper_private_league_members_v3
for each row execute function private.enforce_paper_private_league_scope_v3();

drop trigger if exists paper_private_league_invite_scope_v3 on public.paper_private_league_invites_v3;
create trigger paper_private_league_invite_scope_v3
before insert or update on public.paper_private_league_invites_v3
for each row execute function private.enforce_paper_private_league_scope_v3();

create or replace function public.create_private_paper_league_v3(
  p_owner_user_id uuid,
  p_name text,
  p_base_currency text,
  p_starts_at timestamptz,
  p_join_deadline timestamptz,
  p_ends_at timestamptz,
  p_max_participants integer,
  p_invite_token_hash text,
  p_invite_expires_at timestamptz
)
returns public.paper_competitions_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_name text := trim(p_name);
  v_currency text := upper(trim(p_base_currency));
  v_invite_token_hash text := lower(trim(p_invite_token_hash));
  v_competition public.paper_competitions_v3;
  v_account public.paper_accounts_v3;
begin
  if p_owner_user_id is null then
    raise exception 'private league owner required';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'invalid private league name';
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid private league currency';
  end if;
  if p_starts_at is null
    or p_join_deadline is null
    or p_ends_at is null
    or p_join_deadline <= v_now
    or p_starts_at <= v_now
    or p_join_deadline > p_starts_at
    or p_ends_at <= p_starts_at
  then
    raise exception 'invalid private league window';
  end if;
  if p_max_participants is null or p_max_participants < 2 or p_max_participants > 10000 then
    raise exception 'invalid private league participant limit';
  end if;
  if v_invite_token_hash is null or v_invite_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid private league invite hash';
  end if;
  if p_invite_expires_at is null
    or p_invite_expires_at <= v_now
    or p_invite_expires_at > p_join_deadline
  then
    raise exception 'invalid private league invite expiry';
  end if;

  insert into public.paper_competitions_v3 (
    name,
    kind,
    status,
    base_currency,
    starting_cash,
    starts_at,
    join_deadline,
    ends_at,
    max_participants
  ) values (
    v_name,
    'private_league',
    'open',
    v_currency,
    100000,
    p_starts_at,
    p_join_deadline,
    p_ends_at,
    p_max_participants
  )
  returning * into v_competition;

  insert into public.paper_accounts_v3 (
    user_id,
    name,
    base_currency,
    starting_cash,
    account_type,
    competition_id
  ) values (
    p_owner_user_id,
    pg_catalog.left('Private League · ' || v_name, 80),
    v_currency,
    100000,
    'competition',
    v_competition.id
  )
  returning * into v_account;

  insert into public.paper_cash_balances_v3 (
    account_id,
    user_id,
    currency,
    amount
  ) values (
    v_account.id,
    p_owner_user_id,
    v_currency,
    100000
  );

  insert into public.paper_competition_entries_v3 (
    competition_id,
    user_id,
    account_id
  ) values (
    v_competition.id,
    p_owner_user_id,
    v_account.id
  );

  insert into public.paper_private_league_members_v3 (
    competition_id,
    user_id,
    role
  ) values (
    v_competition.id,
    p_owner_user_id,
    'owner'
  );

  insert into public.paper_private_league_invites_v3 (
    competition_id,
    created_by_user_id,
    invite_token_hash,
    expires_at
  ) values (
    v_competition.id,
    p_owner_user_id,
    v_invite_token_hash,
    p_invite_expires_at
  );

  return v_competition;
end;
$$;

revoke all on function public.create_private_paper_league_v3(uuid,text,text,timestamptz,timestamptz,timestamptz,integer,text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_private_paper_league_v3(uuid,text,text,timestamptz,timestamptz,timestamptz,integer,text,timestamptz) to service_role;

create or replace function public.join_private_paper_league_v3(
  p_user_id uuid,
  p_invite_token_hash text
)
returns public.paper_competition_entries_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_invite_token_hash text := lower(trim(p_invite_token_hash));
  v_invite public.paper_private_league_invites_v3;
  v_competition public.paper_competitions_v3;
  v_entry public.paper_competition_entries_v3;
  v_account public.paper_accounts_v3;
  v_existing_role text;
  v_participant_count integer;
begin
  if p_user_id is null then
    raise exception 'private league user required';
  end if;
  if v_invite_token_hash is null or v_invite_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'private league invite unavailable';
  end if;

  select * into v_invite
  from public.paper_private_league_invites_v3
  where invite_token_hash = v_invite_token_hash
  for update;

  if not found then
    raise exception 'private league invite unavailable';
  end if;

  select * into v_competition
  from public.paper_competitions_v3
  where id = v_invite.competition_id
  for update;

  if not found or v_competition.kind <> 'private_league' then
    raise exception 'private league unavailable';
  end if;

  select * into v_entry
  from public.paper_competition_entries_v3
  where competition_id = v_competition.id
    and user_id = p_user_id;

  if found then
    select role into v_existing_role
    from public.paper_private_league_members_v3
    where competition_id = v_competition.id
      and user_id = p_user_id;

    if not found or v_existing_role not in ('owner', 'admin', 'member') then
      raise exception 'private league membership invalid';
    end if;

    return v_entry;
  end if;

  if v_invite.revoked_at is not null
    or v_invite.expires_at <= v_now
  then
    raise exception 'private league invite unavailable';
  end if;

  if v_competition.status <> 'open'
    or v_now > v_competition.join_deadline
    or v_now >= v_competition.starts_at
  then
    raise exception 'private league is not open for joining';
  end if;

  select count(*)::integer into v_participant_count
  from public.paper_competition_entries_v3
  where competition_id = v_competition.id;

  if v_participant_count >= v_competition.max_participants then
    raise exception 'private league participant limit reached';
  end if;

  insert into public.paper_accounts_v3 (
    user_id,
    name,
    base_currency,
    starting_cash,
    account_type,
    competition_id
  ) values (
    p_user_id,
    pg_catalog.left('Private League · ' || v_competition.name, 80),
    v_competition.base_currency,
    100000,
    'competition',
    v_competition.id
  )
  returning * into v_account;

  insert into public.paper_cash_balances_v3 (
    account_id,
    user_id,
    currency,
    amount
  ) values (
    v_account.id,
    p_user_id,
    v_competition.base_currency,
    100000
  );

  insert into public.paper_competition_entries_v3 (
    competition_id,
    user_id,
    account_id
  ) values (
    v_competition.id,
    p_user_id,
    v_account.id
  )
  returning * into v_entry;

  insert into public.paper_private_league_members_v3 (
    competition_id,
    user_id,
    role
  ) values (
    v_competition.id,
    p_user_id,
    'member'
  );

  return v_entry;
end;
$$;

revoke all on function public.join_private_paper_league_v3(uuid,text) from public, anon, authenticated;
grant execute on function public.join_private_paper_league_v3(uuid,text) to service_role;

create or replace function public.create_private_paper_league_invite_v3(
  p_actor_user_id uuid,
  p_competition_id uuid,
  p_invite_token_hash text,
  p_expires_at timestamptz
)
returns public.paper_private_league_invites_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_invite_token_hash text := lower(trim(p_invite_token_hash));
  v_competition public.paper_competitions_v3;
  v_actor_role text;
  v_invite public.paper_private_league_invites_v3;
begin
  if p_actor_user_id is null or p_competition_id is null then
    raise exception 'private league invite authority required';
  end if;
  if v_invite_token_hash is null or v_invite_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid private league invite hash';
  end if;

  select * into v_competition
  from public.paper_competitions_v3
  where id = p_competition_id
  for update;

  if not found or v_competition.kind <> 'private_league' then
    raise exception 'private league unavailable';
  end if;

  select role into v_actor_role
  from public.paper_private_league_members_v3
  where competition_id = p_competition_id
    and user_id = p_actor_user_id;

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'private league invite forbidden';
  end if;

  if v_competition.status <> 'open'
    or v_now >= v_competition.join_deadline
    or v_now >= v_competition.starts_at
  then
    raise exception 'private league is not open for invites';
  end if;

  if p_expires_at is null
    or p_expires_at <= v_now
    or p_expires_at > v_competition.join_deadline
  then
    raise exception 'invalid private league invite expiry';
  end if;

  insert into public.paper_private_league_invites_v3 (
    competition_id,
    created_by_user_id,
    invite_token_hash,
    expires_at
  ) values (
    p_competition_id,
    p_actor_user_id,
    v_invite_token_hash,
    p_expires_at
  )
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke all on function public.create_private_paper_league_invite_v3(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.create_private_paper_league_invite_v3(uuid,uuid,text,timestamptz) to service_role;

create or replace function public.revoke_private_paper_league_invite_v3(
  p_actor_user_id uuid,
  p_invite_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_invite public.paper_private_league_invites_v3;
  v_competition_kind text;
  v_actor_role text;
begin
  if p_actor_user_id is null or p_invite_id is null then
    return false;
  end if;

  select * into v_invite
  from public.paper_private_league_invites_v3
  where id = p_invite_id
  for update;

  if not found then
    return false;
  end if;

  select kind into v_competition_kind
  from public.paper_competitions_v3
  where id = v_invite.competition_id;

  if not found or v_competition_kind <> 'private_league' then
    raise exception 'private league unavailable';
  end if;

  select role into v_actor_role
  from public.paper_private_league_members_v3
  where competition_id = v_invite.competition_id
    and user_id = p_actor_user_id;

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'private league invite forbidden';
  end if;

  if v_invite.revoked_at is not null then
    return true;
  end if;

  update public.paper_private_league_invites_v3
  set revoked_at = v_now
  where id = p_invite_id;

  return true;
end;
$$;

revoke all on function public.revoke_private_paper_league_invite_v3(uuid,uuid) from public, anon, authenticated;
grant execute on function public.revoke_private_paper_league_invite_v3(uuid,uuid) to service_role;

create or replace function public.set_private_paper_league_member_role_v3(
  p_actor_user_id uuid,
  p_competition_id uuid,
  p_member_user_id uuid,
  p_role text
)
returns public.paper_private_league_members_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competition_kind text;
  v_actor_role text;
  v_target public.paper_private_league_members_v3;
begin
  if p_actor_user_id is null or p_competition_id is null or p_member_user_id is null then
    raise exception 'private league role authority required';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'invalid private league member role';
  end if;

  select kind into v_competition_kind
  from public.paper_competitions_v3
  where id = p_competition_id
  for update;

  if not found or v_competition_kind <> 'private_league' then
    raise exception 'private league unavailable';
  end if;

  select role into v_actor_role
  from public.paper_private_league_members_v3
  where competition_id = p_competition_id
    and user_id = p_actor_user_id;

  if v_actor_role is null or v_actor_role <> 'owner' then
    raise exception 'private league role forbidden';
  end if;

  select * into v_target
  from public.paper_private_league_members_v3
  where competition_id = p_competition_id
    and user_id = p_member_user_id
  for update;

  if not found or v_target.role = 'owner' then
    raise exception 'target private league member unavailable';
  end if;

  update public.paper_private_league_members_v3
  set role = p_role
  where competition_id = p_competition_id
    and user_id = p_member_user_id
  returning * into v_target;

  return v_target;
end;
$$;

revoke all on function public.set_private_paper_league_member_role_v3(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.set_private_paper_league_member_role_v3(uuid,uuid,uuid,text) to service_role;

commit;