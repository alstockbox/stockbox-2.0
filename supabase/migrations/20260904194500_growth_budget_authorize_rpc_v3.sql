-- Serialized budget reservation for paid v3 growth operations.

create or replace function public.acq_authorize_growth_cost_v3(
  p_idempotency_key text,
  p_provider text,
  p_operation text,
  p_estimated_sek numeric,
  p_content_id uuid default null,
  p_render_job_id uuid default null,
  p_optional boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_spend numeric := 0;
  v_target numeric := 50;
  v_hard numeric := 75;
  v_projected numeric;
  v_existing public.acq_budget_ledger%rowtype;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key_required';
  end if;
  if p_estimated_sek is null or p_estimated_sek < 0 then
    raise exception 'invalid_estimated_cost';
  end if;

  perform pg_advisory_xact_lock(hashtext('stockbox-growth-budget:' || v_period::text));

  select * into v_existing
  from public.acq_budget_ledger
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'duplicate', true,
      'ledger_id', v_existing.id,
      'projected_monthly_sek', null
    );
  end if;

  select coalesce(sum(coalesce(actual_sek, estimated_sek)), 0)
  into v_spend
  from public.acq_budget_ledger
  where billing_period = v_period;

  select coalesce(nullif(value, '')::numeric, 50)
  into v_target
  from public.acq_config
  where key = 'growth_budget_target_sek';
  v_target := coalesce(v_target, 50);

  select coalesce(nullif(value, '')::numeric, 75)
  into v_hard
  from public.acq_config
  where key = 'growth_budget_hard_cap_sek';
  v_hard := coalesce(v_hard, 75);

  v_projected := v_spend + p_estimated_sek;

  if v_projected > v_hard then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'hard_cap',
      'current_monthly_sek', v_spend,
      'projected_monthly_sek', v_projected,
      'hard_cap_sek', v_hard
    );
  end if;

  if p_optional and v_projected > v_target then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'target_exceeded',
      'current_monthly_sek', v_spend,
      'projected_monthly_sek', v_projected,
      'target_sek', v_target
    );
  end if;

  insert into public.acq_budget_ledger (
    idempotency_key,
    provider,
    operation,
    content_id,
    render_job_id,
    estimated_sek,
    billing_period,
    metadata
  ) values (
    p_idempotency_key,
    p_provider,
    p_operation,
    p_content_id,
    p_render_job_id,
    p_estimated_sek,
    v_period,
    jsonb_build_object('reservation', true, 'optional', p_optional)
  )
  returning id into v_existing.id;

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'ledger_id', v_existing.id,
    'current_monthly_sek', v_spend,
    'projected_monthly_sek', v_projected,
    'target_sek', v_target,
    'hard_cap_sek', v_hard
  );
end;
$$;

revoke all on function public.acq_authorize_growth_cost_v3(text,text,text,numeric,uuid,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.acq_authorize_growth_cost_v3(text,text,text,numeric,uuid,uuid,boolean)
  to service_role;
