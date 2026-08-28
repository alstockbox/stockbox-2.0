begin;

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
begin
  select coalesce(role, 'customer') into v_role
  from public.profiles
  where id = p_user_id;

  if v_role = 'admin' then
    select entitlements into v_entitlements
    from public.plans where key = 'elite';
    return jsonb_build_object('plan', 'elite', 'entitlements', coalesce(v_entitlements, '{}'::jsonb));
  end if;

  if v_role = 'affiliate_ambassador' then
    return jsonb_build_object(
      'plan', 'affiliate_ambassador',
      'entitlements', jsonb_build_object(
        'monthlyAnalyses', 100,
        'deepAnalyses', 100,
        'watchlistItems', 75,
        'batchRows', 50,
        'portfolios', 5,
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
