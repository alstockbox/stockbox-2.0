begin;

alter table public.background_jobs
  add column if not exists locked_by text;

commit;
