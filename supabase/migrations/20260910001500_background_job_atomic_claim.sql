begin;

create or replace function public.claim_background_jobs(
  p_kinds text[],
  p_limit integer default 10
)
returns table (
  id uuid,
  kind text,
  status text,
  payload jsonb,
  attempts integer,
  max_attempts integer,
  available_at timestamptz,
  locked_at timestamptz,
  dedupe_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if coalesce(array_length(p_kinds, 1), 0) = 0 then
    return;
  end if;

  update public.background_jobs as jobs
  set status = 'failed',
      locked_at = null,
      completed_at = v_now,
      last_error = 'Background job retry budget exhausted before claim.',
      updated_at = v_now
  where jobs.status = 'queued'
    and jobs.kind = any(p_kinds)
    and jobs.available_at <= v_now
    and jobs.attempts >= jobs.max_attempts;

  return query
  with candidates as (
    select jobs.id
    from public.background_jobs as jobs
    where jobs.status = 'queued'
      and jobs.kind = any(p_kinds)
      and jobs.available_at <= v_now
      and jobs.attempts < jobs.max_attempts
    order by jobs.available_at asc, jobs.created_at asc, jobs.id asc
    for update of jobs skip locked
    limit v_limit
  )
  update public.background_jobs as jobs
  set status = 'running',
      attempts = jobs.attempts + 1,
      locked_at = v_now,
      updated_at = v_now
  from candidates
  where jobs.id = candidates.id
  returning
    jobs.id,
    jobs.kind,
    jobs.status,
    jobs.payload,
    jobs.attempts,
    jobs.max_attempts,
    jobs.available_at,
    jobs.locked_at,
    jobs.dedupe_key;
end;
$$;

revoke all on function public.claim_background_jobs(text[], integer) from public, anon, authenticated;
grant execute on function public.claim_background_jobs(text[], integer) to service_role;

commit;
