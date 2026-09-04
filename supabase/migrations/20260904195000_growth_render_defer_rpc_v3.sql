-- Requeue a claimed render without consuming an attempt, for budget/provider deferrals.
create or replace function public.acq_defer_render_job_v3(
  p_job_id uuid,
  p_worker_id text,
  p_reason text
)
returns public.acq_render_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.acq_render_jobs%rowtype;
begin
  select * into v_job
  from public.acq_render_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'render_job_not_found'; end if;
  if v_job.state = 'ready' then return v_job; end if;
  if v_job.worker_id is distinct from p_worker_id then raise exception 'worker_mismatch'; end if;

  update public.acq_render_jobs
  set state = 'queued',
      attempt_count = greatest(0, attempt_count - 1),
      failure_reason = left(coalesce(p_reason, 'deferred'), 1000),
      worker_id = null,
      claimed_at = null,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.acq_defer_render_job_v3(uuid,text,text) from public, anon, authenticated;
grant execute on function public.acq_defer_render_job_v3(uuid,text,text) to service_role;
