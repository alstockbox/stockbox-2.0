begin;

create table if not exists public.analysis_recommendation_v3_performance_rollups (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('BASE', 'SECTOR', 'ANALYSIS_ARCHETYPE', 'MODEL_LINEAGE')),
  horizon text not null check (horizon in ('1d', '7d', '30d', '90d', '180d', '1y')),
  rating text not null check (rating in ('STRONG_BUY', 'BUY', 'WAIT', 'HOLD', 'REDUCE', 'SELL', 'UNAVAILABLE')),
  sector text,
  analysis_archetype text,
  model_version text,
  recommendation_policy_version text,
  outcome_policy_version text not null,
  benchmark_policy_version text not null,
  source_limit integer not null check (source_limit >= 30 and source_limit <= 20000),
  dimension_sample_gate integer not null check (dimension_sample_gate >= 20),
  sample_count integer not null check (sample_count >= 0),
  benchmark_count integer not null check (benchmark_count >= 0 and benchmark_count <= sample_count),
  directional_count integer not null check (directional_count >= 0 and directional_count <= benchmark_count),
  hit_rate numeric check (hit_rate is null or (hit_rate >= 0 and hit_rate <= 1)),
  mean_security_return numeric,
  mean_excess_return numeric,
  median_excess_return numeric,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sector is null or btrim(sector) <> ''),
  check (analysis_archetype is null or btrim(analysis_archetype) <> ''),
  check (model_version is null or btrim(model_version) <> ''),
  check (recommendation_policy_version is null or btrim(recommendation_policy_version) <> ''),
  check (btrim(outcome_policy_version) <> ''),
  check (btrim(benchmark_policy_version) <> ''),
  check (
    (scope = 'BASE' and sector is null and analysis_archetype is null and model_version is null and recommendation_policy_version is null)
    or (scope = 'SECTOR' and sector is not null and analysis_archetype is null and model_version is null and recommendation_policy_version is null)
    or (scope = 'ANALYSIS_ARCHETYPE' and sector is null and analysis_archetype is not null and model_version is null and recommendation_policy_version is null)
    or (scope = 'MODEL_LINEAGE' and sector is null and analysis_archetype is not null and model_version is not null and recommendation_policy_version is not null)
  )
);

create unique index if not exists analysis_recommendation_v3_performance_rollups_identity_idx
  on public.analysis_recommendation_v3_performance_rollups (
    scope,
    horizon,
    rating,
    sector,
    analysis_archetype,
    model_version,
    recommendation_policy_version,
    outcome_policy_version,
    benchmark_policy_version,
    source_limit,
    dimension_sample_gate
  ) nulls not distinct;

create index if not exists analysis_recommendation_v3_performance_rollups_lookup_idx
  on public.analysis_recommendation_v3_performance_rollups (scope, horizon, rating, evaluated_at desc);

alter table public.analysis_recommendation_v3_performance_rollups enable row level security;
revoke all on table public.analysis_recommendation_v3_performance_rollups from public;
revoke all on table public.analysis_recommendation_v3_performance_rollups from anon;
revoke all on table public.analysis_recommendation_v3_performance_rollups from authenticated;
grant select, insert, update, delete on table public.analysis_recommendation_v3_performance_rollups to service_role;

comment on table public.analysis_recommendation_v3_performance_rollups is
  'Private materialized Recommendation V3 performance read-model. Raw objective outcomes remain source of truth; rows are reproducible by policy lineage, bounded source window and dimension sample gate.';

commit;
