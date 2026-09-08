begin;

create table if not exists public.analysis_recommendation_v3_calibration_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_key text not null unique,
  candidate_id text not null,
  policy_version text not null,
  created_at timestamptz not null,
  stage text not null check (stage in ('CANDIDATE', 'BACKTESTED', 'SHADOW_VALIDATED', 'APPROVED', 'PRODUCTION')),
  horizon text not null check (horizon in ('1d', '7d', '30d', '90d', '180d', '1y')),
  rating text not null check (rating in ('STRONG_BUY', 'BUY', 'WAIT', 'HOLD', 'REDUCE', 'SELL', 'UNAVAILABLE')),
  analysis_archetype text not null,
  model_version text not null,
  recommendation_policy_version text not null,
  sample_size integer not null check (sample_size >= 0),
  benchmark_sample_size integer not null check (benchmark_sample_size >= 0 and benchmark_sample_size <= sample_size),
  hit_rate numeric check (hit_rate is null or (hit_rate >= 0 and hit_rate <= 1)),
  mean_excess_return numeric,
  reasons text[] not null default '{}'::text[],
  backtest_improved boolean,
  shadow_improved boolean,
  explicit_approval boolean not null default false,
  approved_at timestamptz,
  production_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint analysis_recommendation_v3_calibration_stage_evidence check (
    stage in ('CANDIDATE', 'BACKTESTED')
    or (stage = 'SHADOW_VALIDATED' and backtest_improved is true)
    or (stage = 'APPROVED' and backtest_improved is true and shadow_improved is true)
    or (
      stage = 'PRODUCTION'
      and backtest_improved is true
      and shadow_improved is true
      and explicit_approval is true
    )
  ),
  constraint analysis_recommendation_v3_calibration_approval_time check (
    approved_at is null or stage in ('APPROVED', 'PRODUCTION')
  ),
  constraint analysis_recommendation_v3_calibration_production_time check (
    production_at is null or stage = 'PRODUCTION'
  )
);

create index if not exists analysis_recommendation_v3_calibration_lineage_idx
  on public.analysis_recommendation_v3_calibration_candidates (
    analysis_archetype,
    model_version,
    recommendation_policy_version,
    horizon,
    rating,
    updated_at desc
  );

create index if not exists analysis_recommendation_v3_calibration_stage_idx
  on public.analysis_recommendation_v3_calibration_candidates (stage, updated_at desc);

create table if not exists public.analysis_recommendation_v3_calibration_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.analysis_recommendation_v3_calibration_candidates(id) on delete restrict,
  from_stage text check (from_stage is null or from_stage in ('CANDIDATE', 'BACKTESTED', 'SHADOW_VALIDATED', 'APPROVED', 'PRODUCTION')),
  to_stage text not null check (to_stage in ('CANDIDATE', 'BACKTESTED', 'SHADOW_VALIDATED', 'APPROVED', 'PRODUCTION')),
  backtest_improved boolean,
  shadow_improved boolean,
  explicit_approval boolean not null default false,
  reason text,
  occurred_at timestamptz not null default now(),
  unique (candidate_id, to_stage)
);

create index if not exists analysis_recommendation_v3_calibration_events_candidate_idx
  on public.analysis_recommendation_v3_calibration_events (candidate_id, occurred_at asc);

create or replace function public.prevent_recommendation_v3_calibration_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Recommendation calibration events are append-only';
end;
$$;

drop trigger if exists recommendation_v3_calibration_events_append_only
  on public.analysis_recommendation_v3_calibration_events;
create trigger recommendation_v3_calibration_events_append_only
before update or delete on public.analysis_recommendation_v3_calibration_events
for each row execute function public.prevent_recommendation_v3_calibration_event_mutation();

alter table public.analysis_recommendation_v3_calibration_candidates enable row level security;
alter table public.analysis_recommendation_v3_calibration_events enable row level security;

revoke all on table public.analysis_recommendation_v3_calibration_candidates from public;
revoke all on table public.analysis_recommendation_v3_calibration_candidates from anon;
revoke all on table public.analysis_recommendation_v3_calibration_candidates from authenticated;
revoke all on table public.analysis_recommendation_v3_calibration_events from public;
revoke all on table public.analysis_recommendation_v3_calibration_events from anon;
revoke all on table public.analysis_recommendation_v3_calibration_events from authenticated;

grant select, insert, update on table public.analysis_recommendation_v3_calibration_candidates to service_role;
grant select, insert on table public.analysis_recommendation_v3_calibration_events to service_role;

revoke all on function public.prevent_recommendation_v3_calibration_event_mutation() from public;
revoke all on function public.prevent_recommendation_v3_calibration_event_mutation() from anon;
revoke all on function public.prevent_recommendation_v3_calibration_event_mutation() from authenticated;

comment on table public.analysis_recommendation_v3_calibration_candidates is
  'Private StockBox 3.0 recommendation calibration control plane. Candidates are segmented by model lineage and cannot reach production without backtest, shadow and explicit approval evidence.';

comment on table public.analysis_recommendation_v3_calibration_events is
  'Append-only audit trail for StockBox 3.0 recommendation calibration lifecycle transitions.';

commit;
