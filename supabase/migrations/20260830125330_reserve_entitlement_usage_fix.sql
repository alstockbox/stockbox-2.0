begin;

create or replace function public.reserve_analysis_entitlement(
  p_user_id uuid,
  p_analysis_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_period_start timestamptz := date_trunc('month', now());
  v_profile_created_at timestamptz;
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
  select coalesce(role, 'customer'), created_at
  into v_role, v_profile_created_at
  from public.profiles
  where id = p_user_id;
  if not found then raise exception 'profile not found'; end if;

  if v_role = 'admin' then
    v_plan_key := 'elite';
    v_monthly_limit := 2147483647;
    v_deep_limit := 2147483647;
  elsif v_role = 'affiliate_ambassador' then
    v_plan_key := 'affiliate_ambassador';
    select * into v_ambassador
    from public.ambassador_entitlements
    where user_id = p_user_id;
    v_monthly_limit := coalesce(v_ambassador.monthly_analyses, 100);
    v_deep_limit := coalesce(v_ambassador.deep_analyses, 100);
  else
    v_plan_key := private.stockbox_effective_plan(p_user_id);
    select entitlements into v_entitlements
    from public.plans where key = v_plan_key and active = true;
    if v_entitlements is null then
      v_plan_key := 'free';
      select entitlements into v_entitlements from public.plans where key = 'free';
    end if;
    v_monthly_limit := coalesce((v_entitlements->>'monthlyAnalyses')::integer, 0);
    v_deep_limit := coalesce((v_entitlements->>'deepAnalyses')::integer, 0);

    if v_plan_key = 'free' then
      if now() < v_profile_created_at + interval '30 days' then
        v_period_start := v_profile_created_at;
        v_monthly_limit := 5;
      else
        v_period_start := date_trunc('month', now());
      end if;
    end if;
  end if;
  select count(*) into v_used_total
  from public.analyses
  where user_id = p_user_id and created_at >= v_period_start;

  select count(*) into v_used_deep
  from public.analyses
  where user_id = p_user_id
    and analysis_type in ('deep', 'research')
    and created_at >= v_period_start;

  select count(*) into v_reserved_total
  from public.analysis_quota_reservations
  where user_id = p_user_id
    and period_start = v_period_start
    and status = 'reserved';

  select count(*) into v_reserved_deep
  from public.analysis_quota_reservations
  where user_id = p_user_id
    and analysis_type in ('deep', 'research')
    and period_start = v_period_start
    and status = 'reserved';

  v_total_usage := v_used_total + v_reserved_total;
  v_deep_usage := v_used_deep + v_reserved_deep;

  if v_total_usage >= v_monthly_limit
     or (v_uses_deep_quota and v_deep_usage >= v_deep_limit) then
    return jsonb_build_object(
      'allowed', false, 'configured', true, 'plan', v_plan_key,
      'reservationId', null,
      'usage', jsonb_build_object('analyses', v_total_usage, 'deepAnalyses', v_deep_usage),
      'limits', jsonb_build_object('analyses', v_monthly_limit, 'deepAnalyses', v_deep_limit)
    );
  end if;
  insert into public.analysis_quota_reservations (
    user_id, analysis_type, period_start
  ) values (
    p_user_id, p_analysis_type, v_period_start
  ) returning id into v_reservation_id;

  return jsonb_build_object(
    'allowed', true, 'configured', true, 'plan', v_plan_key,
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

commit;
