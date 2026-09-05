begin;

create table if not exists public.analysis_recommendation_v3_audit (
  id uuid primary key default gen_random_uuid(),
  observed_at timestamptz not null,
  ticker text not null,
  analysis_fingerprint text,
  analysis_archetype text not null,
  model_version text not null,
  legacy_rating text not null,
  normalized_legacy_rating text not null,
  v3_rating text not null,
  changed boolean not null,
  objective_score numeric,
  conviction numeric not null check (conviction >= 0 and conviction <= 100),
  data_quality numeric not null check (data_quality >= 0 and data_quality <= 100),
  model_uncertainty numeric not null check (model_uncertainty >= 0 and model_uncertainty <= 100),
  had_personalized_score boolean not null default false,
  confidence_gate_passed boolean not null,
  confidence_gate_hard_blocked boolean not null,
  reason_codes jsonb not null default '[]'::jsonb,
  coverage_policy_version text not null,
  anomaly_policy_version text not null,
  recommendation_policy_version text not null,
  coverage_profile text not null,
  verified_coverage numeric not null check (verified_coverage >= 0 and verified_coverage <= 1),
  retrieval_coverage numeric not null check (retrieval_coverage >= 0 and retrieval_coverage <= 1),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  stockbox_failure_count integer not null default 0 check (stockbox_failure_count >= 0),
  source_unavailable_count integer not null default 0 check (source_unavailable_count >= 0),
  recommendation_eligible boolean not null,
  data_integrity_score numeric not null check (data_integrity_score >= 0 and data_integrity_score <= 100),
  blocking_anomaly_count integer not null default 0 check (blocking_anomaly_count >= 0),
  anomaly_codes jsonb not null default '[]'::jsonb,
  recommendation_integrity_eligible boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(reason_codes) = 'array'),
  check (jsonb_typeof(anomaly_codes) = 'array')
);

create unique index if not exists analysis_recommendation_v3_audit_dedupe_idx
  on public.analysis_recommendation_v3_audit (
    ticker,
    analysis_fingerprint,
    model_version,
    recommendation_policy_version
  ) nulls not distinct;

create index if not exists analysis_recommendation_v3_audit_observed_idx
  on public.analysis_recommendation_v3_audit (observed_at desc);

create index if not exists analysis_recommendation_v3_audit_changed_idx
  on public.analysis_recommendation_v3_audit (changed, observed_at desc)
  where changed = true;

create index if not exists analysis_recommendation_v3_audit_blocked_idx
  on public.analysis_recommendation_v3_audit (confidence_gate_hard_blocked, blocking_anomaly_count, observed_at desc)
  where confidence_gate_hard_blocked = true or blocking_anomaly_count > 0;

alter table public.analysis_recommendation_v3_audit enable row level security;

-- Shadow audit is an internal model-validation control plane. No browser/user
-- role receives direct access; the server-side service role is the only writer.
revoke all on table public.analysis_recommendation_v3_audit from public;
revoke all on table public.analysis_recommendation_v3_audit from anon;
revoke all on table public.analysis_recommendation_v3_audit from authenticated;
grant select, insert, update, delete on table public.analysis_recommendation_v3_audit to service_role;

comment on table public.analysis_recommendation_v3_audit is
  'Private StockBox 3.0 recommendation shadow audit. Stores comparison/integrity metadata only; no raw financial payload, user id or personalized score value.';

commit;
