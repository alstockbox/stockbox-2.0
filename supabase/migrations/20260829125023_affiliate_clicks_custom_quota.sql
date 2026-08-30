begin;

alter table public.affiliate_clicks
  add column if not exists visitor_token text,
  add column if not exists landing_path text not null default '/',
  add column if not exists user_agent_hash text;

update public.affiliate_clicks
set visitor_token = 'legacy:' || id::text
where visitor_token is null;

alter table public.affiliate_clicks
  alter column visitor_token set not null;

create unique index if not exists affiliate_clicks_affiliate_visitor_unique
  on public.affiliate_clicks(affiliate_id, visitor_token);
create index if not exists affiliate_clicks_affiliate_created_idx
  on public.affiliate_clicks(affiliate_id, created_at desc);

alter table public.affiliate_clicks enable row level security;
drop policy if exists "affiliate clicks select own" on public.affiliate_clicks;
create policy "affiliate clicks select own" on public.affiliate_clicks
  for select to authenticated using (
    affiliate_id in (select id from public.affiliates where user_id = (select auth.uid()))
  );
grant select on public.affiliate_clicks to authenticated;
revoke insert, update, delete on public.affiliate_clicks from authenticated;

insert into public.affiliates (
  user_id, code, status, display_name, commission_basis_points, monthly_analysis_limit
)
select
  p.id,
  'AMB-' || upper(substr(replace(p.id::text, '-', ''), 1, 12)),
  'active',
  coalesce(nullif(split_part(p.email, '@', 1), ''), 'Ambassador'),
  2000,
  100
from public.profiles p
where p.role = 'affiliate_ambassador'
on conflict (user_id) do nothing;

update public.affiliates a
set status = 'active', updated_at = now()
from public.profiles p
where p.id = a.user_id
  and p.role = 'affiliate_ambassador'
  and a.status = 'pending';

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
  v_monthly_limit integer := 0;
  v_deep_limit integer := 0;
  v_ambassador_limit integer;
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

  select coalesce(p.role, 'customer') into v_role
  from public.profiles p where p.id = p_user_id;
  v_role := coalesce(v_role, 'customer');
  if v_role = 'affiliate_ambassador' then
    select a.monthly_analysis_limit into v_ambassador_limit
    from public.affiliates a
    where a.user_id = p_user_id and a.status = 'active'
    limit 1;

    v_plan_key := 'affiliate_ambassador';
    v_monthly_limit := coalesce(v_ambassador_limit, 0);
    v_deep_limit := v_monthly_limit;
  else
    select s.plan_key into v_plan_key
    from public.subscriptions s
    where s.user_id = p_user_id and s.status in ('active', 'trialing')
    limit 1;

    v_plan_key := coalesce(v_plan_key, 'free');
    select p.entitlements into v_entitlements
    from public.plans p
    where p.key = v_plan_key and p.active = true;

    if v_entitlements is null then
      v_plan_key := 'free';
      select p.entitlements into v_entitlements
      from public.plans p where p.key = 'free';
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

revoke all on function public.reserve_analysis_entitlement(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_analysis_entitlement(uuid, text) to service_role;

commit;