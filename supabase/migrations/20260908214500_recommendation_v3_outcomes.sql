begin;

create table if not exists public.analysis_recommendation_v3_outcomes (
  id uuid primary key default gen_random_uuid(),
  recommendation_audit_id uuid not null references public.analysis_recommendation_v3_audit(id) on delete cascade,
  policy_version text not null,
  horizon text not null check (horizon in ('1d', '7d', '30d', '90d', '180d', '1y')),
  expected_at timestamptz not null,
  evaluated_at timestamptz not null,
  lag_days integer not null default 0 check (lag_days >= 0),
  entry_price numeric not null check (entry_price > 0),
  observed_price numeric not null check (observed_price > 0),
  security_currency text,
  security_return numeric not null,
  benchmark_ticker text,
  benchmark_entry_price numeric check (benchmark_entry_price is null or benchmark_entry_price > 0),
  benchmark_observed_price numeric check (benchmark_observed_price is null or benchmark_observed_price > 0),
  benchmark_return numeric,
  excess_return numeric,
  directional_hit boolean,
  security_price_source text not null,
  benchmark_price_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analysis_recommendation_v3_outcomes_benchmark_consistency check (
    (benchmark_return is null and excess_return is null)
    or (
      benchmark_ticker is not null
      and benchmark_entry_price is not null
      and benchmark_observed_price is not null
      and benchmark_return is not null
      and excess_return is not null
    )
  ),
  constraint analysis_recommendation_v3_outcomes_direction_consistency check (
    directional_hit is null or excess_return is not null
  ),
  unique (recommendation_audit_id, horizon)
);

create index if not exists analysis_recommendation_v3_outcomes_horizon_idx
  on public.analysis_recommendation_v3_outcomes (horizon, evaluated_at desc);

create index if not exists analysis_recommendation_v3_outcomes_audit_idx
  on public.analysis_recommendation_v3_outcomes (recommendation_audit_id, expected_at);

create index if not exists analysis_recommendation_v3_outcomes_benchmark_idx
  on public.analysis_recommendation_v3_outcomes (benchmark_ticker, horizon, evaluated_at desc)
  where benchmark_ticker is not null;

alter table public.analysis_recommendation_v3_outcomes enable row level security;

-- Outcome telemetry is an internal validation control plane. Browser roles have
-- no direct access and the table contains no user identity or personalized score.
revoke all on table public.analysis_recommendation_v3_outcomes from public;
revoke all on table public.analysis_recommendation_v3_outcomes from anon;
revoke all on table public.analysis_recommendation_v3_outcomes from authenticated;
grant select, insert, update, delete on table public.analysis_recommendation_v3_outcomes to service_role;

comment on table public.analysis_recommendation_v3_outcomes is
  'Private StockBox 3.0 objective recommendation outcome telemetry. Links to the privacy-minimized recommendation audit and stores only market/benchmark outcome data.';

commit;
