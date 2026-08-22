alter table public.analyses
  add column if not exists report_schema_version text,
  add column if not exists analysis_archetype text,
  add column if not exists data_coverage numeric(7,6),
  add column if not exists provider_diagnostics jsonb not null default '[]'::jsonb,
  add column if not exists source_provenance jsonb not null default '{}'::jsonb,
  add column if not exists valuation_method text,
  add column if not exists valuation_status text;

create index if not exists analyses_archetype_created_idx
  on public.analyses (analysis_archetype, created_at desc);
