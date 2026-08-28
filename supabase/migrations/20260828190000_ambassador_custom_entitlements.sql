begin;

create table if not exists public.ambassador_entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  monthly_analyses integer not null default 100
    check (monthly_analyses between 0 and 100000),
  deep_analyses integer not null default 100
    check (deep_analyses between 0 and 100000),
  batch_rows integer not null default 50
    check (batch_rows between 0 and 50),
  watchlist_items integer not null default 75
    check (watchlist_items between 0 and 100000),
  portfolios integer not null default 5
    check (portfolios between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deep_analyses <= monthly_analyses)
);

alter table public.ambassador_entitlements enable row level security;
revoke all on public.ambassador_entitlements from public, anon, authenticated;
grant select, insert, update on public.ambassador_entitlements to service_role;

insert into public.ambassador_entitlements (
  user_id, monthly_analyses, deep_analyses, batch_rows, watchlist_items, portfolios
)
select id, 100, 100, 50, 75, 5
from public.profiles
where role = 'affiliate_ambassador'
on conflict (user_id) do nothing;

create or replace function public.set_affiliate_ambassador_access(
  p_actor_id uuid,
  p_target_id uuid,
  p_enabled boolean,
  p_monthly_analyses integer,
  p_deep_analyses integer,
  p_batch_rows integer,
  p_watchlist_items integer,
  p_portfolios integer,
  p_commission_basis_points integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_previous_entitlement public.ambassador_entitlements%rowtype;
  v_next_role text;
begin
  if p_actor_id = p_target_id then
    raise exception 'admin accounts cannot change their own role';
  end if;
  if p_monthly_analyses not between 0 and 100000
     or p_deep_analyses not between 0 and 100000
     or p_deep_analyses > p_monthly_analyses
     or p_batch_rows not between 0 and 50
     or p_watchlist_items not between 0 and 100000
     or p_portfolios not between 0 and 10000
     or p_commission_basis_points not between 0 and 10000 then
    raise exception 'invalid ambassador entitlement values';
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

  select * into v_previous_entitlement
  from public.ambassador_entitlements
  where user_id = p_target_id;

  v_next_role := case when p_enabled then 'affiliate_ambassador' else 'customer' end;
  update public.profiles
  set role = v_next_role,
      updated_at = now()
  where id = p_target_id;

  insert into public.ambassador_entitlements (
    user_id, monthly_analyses, deep_analyses, batch_rows, watchlist_items, portfolios, updated_at
  ) values (
    p_target_id, p_monthly_analyses, p_deep_analyses,
    p_batch_rows, p_watchlist_items, p_portfolios, now()
  )
  on conflict (user_id) do update set
    monthly_analyses = excluded.monthly_analyses,
    deep_analyses = excluded.deep_analyses,
    batch_rows = excluded.batch_rows,
    watchlist_items = excluded.watchlist_items,
    portfolios = excluded.portfolios,
    updated_at = now();

  if p_enabled then
    insert into public.affiliates (
      user_id, code, status, commission_basis_points, metadata
    ) values (
      p_target_id,
      'sb_' || replace(p_target_id::text, '-', ''),
      'active',
      p_commission_basis_points,
      jsonb_build_object('source', 'affiliate_ambassador')
    )
    on conflict (user_id) do update set
      status = 'active',
      commission_basis_points = excluded.commission_basis_points,
      metadata = public.affiliates.metadata || jsonb_build_object('source', 'affiliate_ambassador');
  else
    update public.affiliates
    set status = 'inactive',
        commission_basis_points = p_commission_basis_points
    where user_id = p_target_id;
  end if;

  insert into public.audit_logs (
    actor_id, action, target_type, target_id, metadata
  ) values (
    p_actor_id,
    case when p_enabled then 'affiliate_ambassador_configured' else 'affiliate_ambassador_revoked' end,
    'profile',
    p_target_id::text,
    jsonb_build_object(
      'email', v_target.email,
      'previousRole', v_target.role,
      'nextRole', v_next_role,
      'previousEntitlements', to_jsonb(v_previous_entitlement),
      'nextEntitlements', jsonb_build_object(
        'monthlyAnalyses', p_monthly_analyses,
        'deepAnalyses', p_deep_analyses,
        'batchRows', p_batch_rows,
        'watchlistItems', p_watchlist_items,
        'portfolios', p_portfolios
      ),
      'commissionBasisPoints', p_commission_basis_points
    )
  );

  return jsonb_build_object(
    'ok', true,
    'userId', p_target_id,
    'role', v_next_role,
    'enabled', p_enabled,
    'limits', jsonb_build_object(
      'analyses', p_monthly_analyses,
      'deepAnalyses', p_deep_analyses,
      'batchRows', p_batch_rows,
      'watchlistItems', p_watchlist_items,
      'portfolios', p_portfolios
    ),
    'commissionBasisPoints', p_commission_basis_points
  );
end;
$$;
revoke all on function public.set_affiliate_ambassador_access(
  uuid, uuid, boolean, integer, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.set_affiliate_ambassador_access(
  uuid, uuid, boolean, integer, integer, integer, integer, integer, integer
) to service_role;

create or replace function public.reserve_analysis_entitlement(
  p_user_id uuid,
  p_analysis_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now());
  v_plan_key text := 'free';
  v_role text := 'customer';
  v_entitlements jsonb;
  v_ambassador public.ambassador_entitlements%rowtype;
  v_monthly_limit integer := 0;
  v_deep_limit integer := 0;
  v_used_total integer := 0;
  v_used_deep integer := 0;
  v_reserved_total integer := 0;
  v_reserved_deep integer := 0;
  v_total_usage integer := 0;
  v_deep_usage integer := 0;
  v_uses_deep_quota boolean := p_analysis_type in ('deep', 'research');
  v_reservation_id uuid;
begin
  if p_analysis_type not in ('summary', 'numbers', 'deep', 'research') then
    raise exception 'unsupported analysis type';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select coalesce(role, 'customer') into v_role
  from public.profiles where id = p_user_id;
  v_role := coalesce(v_role, 'customer');

  if v_role = 'affiliate_ambassador' then
    v_plan_key := 'affiliate_ambassador';
    select * into v_ambassador
    from public.ambassador_entitlements
    where user_id = p_user_id;
    if not found then
      insert into public.error_logs (user_id, service, sanitized_error, context)
      values (
        p_user_id,
        'ambassador-entitlements',
        'Ambassador entitlement row missing; using historical fallback.',
        jsonb_build_object('source', 'reserve_analysis_entitlement')
      );
    end if;
    v_monthly_limit := coalesce(v_ambassador.monthly_analyses, 100);
    v_deep_limit := coalesce(v_ambassador.deep_analyses, 100);
  else
    select s.plan_key into v_plan_key
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trialing')
    limit 1;

    v_plan_key := coalesce(v_plan_key, 'free');
    select p.entitlements into v_entitlements
    from public.plans p
    where p.key = v_plan_key and p.active = true;

    if v_entitlements is null then
      v_plan_key := 'free';
      select entitlements into v_entitlements
      from public.plans where key = 'free';
    end if;

    v_monthly_limit := coalesce((v_entitlements->>'monthlyAnalyses')::integer, 0);
    v_deep_limit := coalesce((v_entitlements->>'deepAnalyses')::integer, 0);
  end if;

  select count(*) into v_used_total
  from public.analyses
  where user_id = p_user_id and created_at >= v_month_start;

  select count(*) into v_used_deep
  from public.analyses
  where user_id = p_user_id
    and analysis_type in ('deep', 'research')
    and created_at >= v_month_start;

  select count(*) into v_reserved_total
  from public.analysis_quota_reservations
  where user_id = p_user_id
    and period_start = v_month_start
    and status = 'reserved';

  select count(*) into v_reserved_deep
  from public.analysis_quota_reservations
  where user_id = p_user_id
    and analysis_type in ('deep', 'research')
    and period_start = v_month_start
    and status = 'reserved';

  v_total_usage := v_used_total + v_reserved_total;
  v_deep_usage := v_used_deep + v_reserved_deep;

  if v_total_usage >= v_monthly_limit
    or (v_uses_deep_quota and v_deep_usage >= v_deep_limit) then
    return jsonb_build_object(
      'allowed', false,
      'configured', true,
      'plan', v_plan_key,
      'reservationId', null,
      'usage', jsonb_build_object('analyses', v_total_usage, 'deepAnalyses', v_deep_usage),
      'limits', jsonb_build_object('analyses', v_monthly_limit, 'deepAnalyses', v_deep_limit)
    );
  end if;

  insert into public.analysis_quota_reservations (
    user_id, analysis_type, period_start
  ) values (
    p_user_id, p_analysis_type, v_month_start
  ) returning id into v_reservation_id;

  return jsonb_build_object(
    'allowed', true,
    'configured', true,
    'plan', v_plan_key,
    'reservationId', v_reservation_id,
    'usage', jsonb_build_object('analyses', v_total_usage, 'deepAnalyses', v_deep_usage),
    'limits', jsonb_build_object('analyses', v_monthly_limit, 'deepAnalyses', v_deep_limit)
  );
end;
$$;

revoke all on function public.reserve_analysis_entitlement(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_analysis_entitlement(uuid, text)
  to service_role;

create or replace function private.workspace_entitlements(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_role text := 'customer';
  v_plan_key text := 'free';
  v_entitlements jsonb;
  v_ambassador public.ambassador_entitlements%rowtype;
begin
  select coalesce(role, 'customer') into v_role
  from public.profiles
  where id = p_user_id;

  if v_role = 'admin' then
    select entitlements into v_entitlements
    from public.plans where key = 'elite';
    return jsonb_build_object(
      'plan', 'elite',
      'entitlements', coalesce(v_entitlements, '{}'::jsonb)
    );
  end if;

  if v_role = 'affiliate_ambassador' then
    select * into v_ambassador
    from public.ambassador_entitlements
    where user_id = p_user_id;
    if not found then
      insert into public.error_logs (user_id, service, sanitized_error, context)
      values (
        p_user_id,
        'ambassador-entitlements',
        'Ambassador entitlement row missing; using historical fallback.',
        jsonb_build_object('source', 'workspace_entitlements')
      );
    end if;

    return jsonb_build_object(
      'plan', 'affiliate_ambassador',
      'entitlements', jsonb_build_object(
        'monthlyAnalyses', coalesce(v_ambassador.monthly_analyses, 100),
        'deepAnalyses', coalesce(v_ambassador.deep_analyses, 100),
        'watchlistItems', coalesce(v_ambassador.watchlist_items, 75),
        'batchRows', coalesce(v_ambassador.batch_rows, 50),
        'portfolios', coalesce(v_ambassador.portfolios, 5),
        'aiAssistant', false,
        'hourlyAlerts', false
      )
    );
  end if;

  select plan_key into v_plan_key
  from public.subscriptions
  where user_id = p_user_id
    and status in ('active', 'trialing')
  limit 1;

  v_plan_key := coalesce(v_plan_key, 'free');
  select entitlements into v_entitlements
  from public.plans
  where key = v_plan_key and active = true;

  if v_entitlements is null then
    v_plan_key := 'free';
    select entitlements into v_entitlements
    from public.plans where key = 'free';
  end if;

  return jsonb_build_object(
    'plan', v_plan_key,
    'entitlements', coalesce(v_entitlements, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.workspace_entitlements(uuid)
  from public, anon, authenticated;

commit;
