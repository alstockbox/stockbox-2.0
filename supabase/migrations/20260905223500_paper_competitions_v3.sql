begin;

create table if not exists public.paper_competitions_v3 (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('challenge', 'private_league')),
  status text not null default 'open' check (status in ('open', 'active', 'completed', 'cancelled')),
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  starting_cash numeric(30,10) not null default 100000 check (starting_cash = 100000),
  starts_at timestamptz not null,
  join_deadline timestamptz not null,
  ends_at timestamptz not null,
  max_participants integer not null default 100 check (max_participants between 2 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (join_deadline <= starts_at)
);

alter table public.paper_accounts_v3
  add column if not exists account_type text not null default 'personal',
  add column if not exists competition_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'paper_accounts_v3_account_type_valid'
      and conrelid = 'public.paper_accounts_v3'::regclass
  ) then
    alter table public.paper_accounts_v3
      add constraint paper_accounts_v3_account_type_valid
      check (
        (account_type = 'personal' and competition_id is null)
        or (account_type = 'competition' and competition_id is not null)
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'paper_accounts_v3_competition_fk'
      and conrelid = 'public.paper_accounts_v3'::regclass
  ) then
    alter table public.paper_accounts_v3
      add constraint paper_accounts_v3_competition_fk
      foreign key (competition_id)
      references public.paper_competitions_v3(id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'paper_accounts_v3_id_competition_unique'
      and conrelid = 'public.paper_accounts_v3'::regclass
  ) then
    alter table public.paper_accounts_v3
      add constraint paper_accounts_v3_id_competition_unique
      unique (id, competition_id);
  end if;
end;
$$;

create unique index if not exists paper_accounts_v3_user_competition_unique
  on public.paper_accounts_v3 (user_id, competition_id)
  where account_type = 'competition';

create table if not exists public.paper_competition_entries_v3 (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.paper_competitions_v3(id) on delete restrict,
  user_id uuid not null,
  account_id uuid not null,
  joined_at timestamptz not null default now(),
  unique (competition_id, user_id),
  unique (account_id),
  foreign key (account_id, user_id)
    references public.paper_accounts_v3(id, user_id)
    on delete restrict,
  foreign key (account_id, competition_id)
    references public.paper_accounts_v3(id, competition_id)
    on delete restrict
);

create index if not exists paper_competition_entries_v3_competition_joined_idx
  on public.paper_competition_entries_v3 (competition_id, joined_at, id);
create index if not exists paper_competition_entries_v3_user_joined_idx
  on public.paper_competition_entries_v3 (user_id, joined_at desc);

alter table public.paper_competitions_v3 enable row level security;
alter table public.paper_competition_entries_v3 enable row level security;

revoke all on public.paper_competitions_v3 from public, anon, authenticated;
revoke all on public.paper_competition_entries_v3 from public, anon, authenticated;

create or replace function public.create_paper_account_v3(
  p_user_id uuid,
  p_name text,
  p_base_currency text,
  p_starting_cash numeric
)
returns public.paper_accounts_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.paper_accounts_v3;
  v_name text := trim(p_name);
  v_currency text := upper(trim(p_base_currency));
  v_account_count integer;
begin
  if p_user_id is null then raise exception 'user id required'; end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid account name';
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid base currency';
  end if;
  if p_starting_cash is null or p_starting_cash <> 100000 then
    raise exception 'paper starting cash must equal 100000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_user_id::text));

  select count(*)::integer into v_account_count
  from public.paper_accounts_v3
  where user_id = p_user_id
    and account_type = 'personal';

  if v_account_count >= 20 then
    raise exception 'paper account limit reached';
  end if;

  insert into public.paper_accounts_v3 (
    user_id,
    name,
    base_currency,
    starting_cash,
    account_type,
    competition_id
  )
  values (p_user_id, v_name, v_currency, 100000, 'personal', null)
  returning * into v_account;

  insert into public.paper_cash_balances_v3 (account_id, user_id, currency, amount)
  values (v_account.id, p_user_id, v_currency, 100000);

  return v_account;
end;
$$;

revoke all on function public.create_paper_account_v3(uuid,text,text,numeric) from public, anon, authenticated;
grant execute on function public.create_paper_account_v3(uuid,text,text,numeric) to service_role;

create or replace function public.join_paper_competition_v3(
  p_user_id uuid,
  p_competition_id uuid
)
returns public.paper_competition_entries_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competition public.paper_competitions_v3;
  v_entry public.paper_competition_entries_v3;
  v_account public.paper_accounts_v3;
  v_participant_count integer;
begin
  if p_user_id is null or p_competition_id is null then
    raise exception 'paper competition identity required';
  end if;

  select * into v_competition
  from public.paper_competitions_v3
  where id = p_competition_id
  for update;

  if not found then
    raise exception 'paper competition unavailable';
  end if;

  select * into v_entry
  from public.paper_competition_entries_v3
  where competition_id = p_competition_id
    and user_id = p_user_id;

  if found then
    return v_entry;
  end if;

  if v_competition.status <> 'open'
    or pg_catalog.now() > v_competition.join_deadline
    or pg_catalog.now() >= v_competition.starts_at
  then
    raise exception 'paper competition is not open for joining';
  end if;

  select count(*)::integer into v_participant_count
  from public.paper_competition_entries_v3
  where competition_id = p_competition_id;

  if v_participant_count >= v_competition.max_participants then
    raise exception 'paper competition participant limit reached';
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
    pg_catalog.left('Competition · ' || v_competition.name, 80),
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

  return v_entry;
end;
$$;

revoke all on function public.join_paper_competition_v3(uuid,uuid) from public, anon, authenticated;
grant execute on function public.join_paper_competition_v3(uuid,uuid) to service_role;

create or replace function private.enforce_paper_competition_fill_window_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_type text;
  v_competition_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  select account_type, competition_id
    into v_account_type, v_competition_id
  from public.paper_accounts_v3
  where id = new.account_id
    and user_id = new.user_id;

  if not found then
    raise exception 'paper competition fill account unavailable';
  end if;

  if v_account_type <> 'competition' then
    return new;
  end if;

  select starts_at, ends_at
    into v_starts_at, v_ends_at
  from public.paper_competitions_v3
  where id = v_competition_id;

  if not found then
    raise exception 'paper competition fill competition unavailable';
  end if;

  if new.executed_at < v_starts_at
    or new.executed_at > v_ends_at
    or new.market_observed_at < v_starts_at
    or new.market_observed_at > v_ends_at
  then
    raise exception 'paper competition fill outside official window';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_paper_competition_fill_window_v3() from public, anon, authenticated;

drop trigger if exists paper_competition_fill_window_v3 on public.paper_fills_v3;
create trigger paper_competition_fill_window_v3
before insert or update on public.paper_fills_v3
for each row execute function private.enforce_paper_competition_fill_window_v3();

commit;