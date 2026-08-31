begin;

alter table public.background_jobs
  add column if not exists dedupe_key text;

create index if not exists background_jobs_kind_status_available_idx
  on public.background_jobs (kind, status, available_at, created_at);

create unique index if not exists background_jobs_active_dedupe_idx
  on public.background_jobs (dedupe_key)
  where dedupe_key is not null and status in ('queued', 'processing');

create or replace function public.claim_background_jobs(
  p_kind text,
  p_limit integer default 5
)
returns setof public.background_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.background_jobs
    where kind = p_kind
      and status = 'queued'
      and available_at <= now()
    order by available_at asc, created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 25))
  )
  update public.background_jobs jobs
  set status = 'processing',
      locked_at = now(),
      attempts = jobs.attempts + 1
  from candidates
  where jobs.id = candidates.id
  returning jobs.*;
end;
$$;

revoke all on function public.claim_background_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_background_jobs(text, integer) to service_role;

commit;
