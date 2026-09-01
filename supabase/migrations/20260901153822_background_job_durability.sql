begin;

alter table public.background_jobs
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists background_jobs_active_dedupe_idx
  on public.background_jobs (kind, dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');

create index if not exists background_jobs_stale_running_idx
  on public.background_jobs (locked_at)
  where status = 'running';

commit;
