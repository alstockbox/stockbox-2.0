-- Finalize provider reservations with measured usage without double-counting spend.

create or replace function public.acq_finalize_growth_usage_v3(
  p_idempotency_key text,
  p_provider text,
  p_operation text,
  p_estimated_sek numeric,
  p_actual_sek numeric default null,
  p_render_job_id uuid default null
)
returns public.acq_budget_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.acq_budget_ledger%rowtype;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key_required';
  end if;
  if p_provider is null or btrim(p_provider) = '' or p_operation is null or btrim(p_operation) = '' then
    raise exception 'provider_operation_required';
  end if;
  if p_estimated_sek is null or p_estimated_sek < 0 then
    raise exception 'invalid_estimated_cost';
  end if;
  if p_actual_sek is not null and p_actual_sek < 0 then
    raise exception 'invalid_actual_cost';
  end if;

  select * into v_row
  from public.acq_budget_ledger
  where idempotency_key = p_idempotency_key
  for update;

  if not found then
    raise exception 'usage_reservation_not_found';
  end if;
  if v_row.provider <> p_provider or v_row.operation <> p_operation then
    raise exception 'usage_reservation_identity_mismatch';
  end if;
  if p_render_job_id is not null and v_row.render_job_id is distinct from p_render_job_id then
    raise exception 'usage_render_job_mismatch';
  end if;

  update public.acq_budget_ledger
  set estimated_sek = greatest(v_row.estimated_sek, p_estimated_sek),
      actual_sek = coalesce(p_actual_sek, v_row.actual_sek),
      metadata = coalesce(v_row.metadata, '{}'::jsonb)
        || jsonb_build_object('reservation', false, 'finalized', true, 'finalized_at', now())
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.acq_finalize_growth_usage_v3(text,text,text,numeric,numeric,uuid)
  from public, anon, authenticated;
grant execute on function public.acq_finalize_growth_usage_v3(text,text,text,numeric,numeric,uuid)
  to service_role;
