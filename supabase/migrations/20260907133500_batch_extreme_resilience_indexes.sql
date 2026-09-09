-- These indexes support live stale/orphan recovery paths. Build them online so
-- applying this migration does not block normal batch/job writes on large tables.

create index concurrently if not exists batch_items_processing_updated_idx
  on public.batch_items (updated_at, batch_id)
  where status = 'processing';

create index concurrently if not exists batch_items_queued_updated_idx
  on public.batch_items (updated_at, batch_id)
  where status = 'queued';

create index concurrently if not exists batch_items_batch_status_idx
  on public.batch_items (batch_id, status);

create index concurrently if not exists background_jobs_queued_kind_available_idx
  on public.background_jobs (kind, available_at)
  where status = 'queued';

create index concurrently if not exists background_jobs_running_kind_locked_idx
  on public.background_jobs (kind, locked_at)
  where status = 'running';
