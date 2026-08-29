begin;

create table if not exists public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now()
);

create index if not exists affiliate_clicks_affiliate_created_idx
  on public.affiliate_clicks (affiliate_id, created_at desc);

create table if not exists public.affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  referred_user_id uuid not null unique references public.profiles(id) on delete cascade,
  code text not null,
  status text not null default 'signed_up' check (status in ('signed_up', 'converted', 'cancelled', 'refunded')),
  attributed_at timestamptz not null default now(),
  converted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists affiliate_attributions_affiliate_created_idx
  on public.affiliate_attributions (affiliate_id, attributed_at desc);

alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_attributions enable row level security;
revoke all on public.affiliate_clicks from public, anon, authenticated;
revoke all on public.affiliate_attributions from public, anon, authenticated;

grant select, insert on public.affiliate_clicks to service_role;
grant select, insert, update on public.affiliate_attributions to service_role;

create or replace function public.record_affiliate_click(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_code text := lower(trim(coalesce(p_code, '')));
begin
  if v_code !~ '^[a-z0-9_-]{3,64}$' then
    return jsonb_build_object('recorded', false, 'reason', 'invalid_code');
  end if;

  select * into v_affiliate
  from public.affiliates
  where lower(code) = v_code and status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'inactive_or_missing');
  end if;

  insert into public.affiliate_clicks (affiliate_id, code)
  values (v_affiliate.id, v_affiliate.code);

  return jsonb_build_object('recorded', true);
end;
$$;

revoke all on function public.record_affiliate_click(text) from public, anon, authenticated;
grant execute on function public.record_affiliate_click(text) to service_role;

create or replace function public.attribute_affiliate_signup(
  p_code text,
  p_referred_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_existing public.affiliate_attributions%rowtype;
  v_code text := lower(trim(coalesce(p_code, '')));
begin
  if p_referred_user_id is null or v_code !~ '^[a-z0-9_-]{3,64}$' then
    return jsonb_build_object('attributed', false, 'reason', 'invalid_input');
  end if;

  perform pg_advisory_xact_lock(hashtext('affiliate-attribution:' || p_referred_user_id::text));

  select * into v_existing
  from public.affiliate_attributions
  where referred_user_id = p_referred_user_id
  for update;

  if found then
    return jsonb_build_object('attributed', false, 'reason', 'first_touch_preserved');
  end if;

  select * into v_affiliate
  from public.affiliates
  where lower(code) = v_code and status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('attributed', false, 'reason', 'inactive_or_missing');
  end if;

  if v_affiliate.user_id = p_referred_user_id then
    return jsonb_build_object('attributed', false, 'reason', 'self_referral');
  end if;

  insert into public.affiliate_attributions (
    affiliate_id, referred_user_id, code
  ) values (
    v_affiliate.id, p_referred_user_id, v_affiliate.code
  );

  return jsonb_build_object('attributed', true, 'reason', 'created');
end;
$$;

revoke all on function public.attribute_affiliate_signup(text, uuid) from public, anon, authenticated;
grant execute on function public.attribute_affiliate_signup(text, uuid) to service_role;

create or replace function public.set_affiliate_ambassador_role(
  p_actor_id uuid,
  p_target_id uuid,
  p_enabled boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_next_role text;
begin
  if p_actor_id = p_target_id then
    raise exception 'admin accounts cannot change their own role';
  end if;

  select * into v_target
  from public.profiles
  where id = p_target_id
  for update;

  if not found then
    raise exception 'target profile not found';
  end if;
  if v_target.role = 'admin' then
    raise exception 'admin accounts cannot be converted to ambassador accounts';
  end if;

  v_next_role := case when p_enabled then 'affiliate_ambassador' else 'customer' end;
  update public.profiles
    set role = v_next_role, updated_at = now()
    where id = p_target_id;

  if p_enabled then
    insert into public.affiliates (
      user_id,
      code,
      status,
      commission_basis_points,
      metadata
    ) values (
      p_target_id,
      'sb_' || replace(p_target_id::text, '-', ''),
      'active',
      0,
      jsonb_build_object('source', 'affiliate_ambassador')
    )
    on conflict (user_id) do update
      set status = 'active',
          metadata = public.affiliates.metadata || jsonb_build_object('source', 'affiliate_ambassador');
  else
    update public.affiliates
      set status = 'inactive'
      where user_id = p_target_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_actor_id,
    case when p_enabled then 'affiliate_ambassador_granted' else 'affiliate_ambassador_revoked' end,
    'profile',
    p_target_id::text,
    jsonb_build_object(
      'email', v_target.email,
      'previousrole', v_target.role,
      'nextrole', v_next_role
    )
  );

  return jsonb_build_object(
    'ok', true,
    'userid', p_target_id,
    'previousrole', v_target.role,
    'nextrole', v_next_role
  );
end;
$$;

revoke all on function public.set_affiliate_ambassador_role(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_affiliate_ambassador_role(uuid, uuid, boolean)
  to service_role;

commit;
