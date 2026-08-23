create table if not exists public.analysis_batch_qa_results (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  rerun_key text not null,
  model_version text not null,
  provider_versions jsonb not null default '{}'::jsonb,
  analysis_timestamp timestamptz not null,
  canonical_entity text not null,
  analysis_archetype text not null,
  data_coverage numeric(7,6) not null,
  confidence numeric(7,3) not null,
  qa_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, rerun_key, canonical_entity)
);

create index if not exists analysis_batch_qa_results_batch_idx
  on public.analysis_batch_qa_results (batch_id, analysis_timestamp desc);

alter table public.analysis_batch_qa_results enable row level security;
