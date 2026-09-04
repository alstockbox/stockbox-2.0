-- Explicit output kind for autonomous growth render jobs.

alter table public.acq_render_jobs
  add column if not exists job_kind text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.acq_render_jobs
set job_kind = 'video'
where job_kind is null;

alter table public.acq_render_jobs
  alter column job_kind set default 'video',
  alter column job_kind set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'acq_render_jobs_job_kind_check'
  ) then
    alter table public.acq_render_jobs
      add constraint acq_render_jobs_job_kind_check
      check (job_kind in ('video','carousel','static_image'));
  end if;
end $$;

create index if not exists acq_render_jobs_kind_state_idx
  on public.acq_render_jobs(job_kind, state, created_at);

insert into public.acq_config (key, value, value_type, description)
values
  ('growth_generative_provider_enabled', 'false', 'boolean', 'Explicit gate for paid generative micro-scenes'),
  ('growth_generative_cost_sek_per_second', '', 'number', 'Known measured SEK cost per second required before generative provider enablement')
on conflict (key) do nothing;
