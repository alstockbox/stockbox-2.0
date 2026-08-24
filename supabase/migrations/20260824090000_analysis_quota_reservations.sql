begin;

alter table public.analyses drop constraint if exists analyses_analysis_type_check;
alter table public.analyses
  add constraint analyses_analysis_type_check
  check (analysis_type in ('summary', 'numbers', 'deep', 'research'));

create table if not exists public.analysis_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  analysis_type text not null check (analysis_type in ('summary', 'numbers', 'deep', 'research')),
  period_start timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released', 'failed')),
  analysis_id uuid references public.analyses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analysis_quota_reservations_user_period_status_idx
  on public.analysis_quota_reservations (user_id, period_start, status);

alter table public.analysis_quota_reservations enable row level security;

drop policy if exists "analysis quota reservations select own" on public.analysis_quota_reservations;
create policy "analysis quota reservations select own"
  on public.analysis_quota_reservations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.analysis_quota_reservations to authenticated;

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
  v_entitlements jsonb;
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
    raise exception 'Unsupported analysis type';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select s.plan_key
    into v_plan_key
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.status in ('active', 'trialing')
  limit 1;

  v_plan_key := coalesce(v_plan_key, 'free');

  select p.entitlements
    into v_entitlements
  from public.plans p
  where p.key = v_plan_key
    and p.active = true;

  if v_entitlements is null then
    v_plan_key := 'free';
    select p.entitlements into v_entitlements from public.plans p where p.key = 'free';
  end if;

  v_monthly_limit := coalesce((v_entitlements->>'monthlyAnalyses')::integer, 0);
  v_deep_limit := coalesce((v_entitlements->>'deepAnalyses')::integer, 0);

  select count(*) into v_used_total
  from public.analyses
  where user_id = p_user_id
    and created_at >= v_month_start;

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

  if v_total_usage >= v_monthly_limit or (v_uses_deep_quota and v_deep_usage >= v_deep_limit) then
    return jsonb_build_object(
      'allowed', false,
      'configured', true,
      'plan', v_plan_key,
      'reservationId', null,
      'usage', jsonb_build_object('analyses', v_total_usage, 'deepAnalyses', v_deep_usage),
      'limits', jsonb_build_object('analyses', v_monthly_limit, 'deepAnalyses', v_deep_limit)
    );
  end if;

  insert into public.analysis_quota_reservations (user_id, analysis_type, period_start)
  values (p_user_id, p_analysis_type, v_month_start)
  returning id into v_reservation_id;

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

revoke all on function public.reserve_analysis_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_analysis_entitlement(uuid, text) to service_role;

commit;
