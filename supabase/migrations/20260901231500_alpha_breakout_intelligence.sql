begin;

create table public.alpha_predictions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  sector text,
  archetype text,
  price_at_prediction numeric(30,10),
  price_currency text,
  market_cap numeric(30,4),
  market_cap_currency text,
  market_cap_band text not null check (market_cap_band in ('micro', 'small', 'mid', 'large', 'mega', 'unknown')),
  fundamental_score numeric(5,2),
  alpha_score numeric(5,2) not null check (alpha_score between 0 and 100),
  breakout_score numeric(5,2) not null check (breakout_score between 0 and 100),
  classification text not null check (classification in ('exceptional', 'high_potential', 'watchlist', 'low_conviction')),
  confidence numeric(6,5) not null check (confidence between 0 and 1),
  scores jsonb not null,
  risk jsonb not null,
  probabilities jsonb not null,
  strongest_signals jsonb not null default '[]'::jsonb,
  risk_signals jsonb not null default '[]'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  methodology jsonb not null default '{}'::jsonb,
  model_version text not null,
  source_report_model_version text,
  prediction_as_of timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, model_version)
);

create table public.alpha_prediction_outcomes (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.alpha_predictions(id) on delete cascade,
  horizon_days integer not null check (horizon_days in (30, 90, 180, 365)),
  price_start numeric(30,10) not null check (price_start > 0),
  price_end numeric(30,10) not null check (price_end > 0),
  observed_return numeric(12,8) not null,
  benchmark_symbol text,
  benchmark_return numeric(12,8),
  market_data_as_of timestamptz not null,
  evaluated_at timestamptz not null default now(),
  unique (prediction_id, horizon_days)
);

create index alpha_predictions_alpha_score_idx
  on public.alpha_predictions (alpha_score desc, confidence desc, prediction_as_of desc);
create index alpha_predictions_breakout_idx
  on public.alpha_predictions (breakout_score desc, confidence desc, prediction_as_of desc);
create index alpha_predictions_ticker_time_idx
  on public.alpha_predictions (ticker, prediction_as_of desc);
create index alpha_predictions_market_cap_idx
  on public.alpha_predictions (market_cap_band, market_cap, prediction_as_of desc);
create index alpha_prediction_outcomes_horizon_idx
  on public.alpha_prediction_outcomes (horizon_days, evaluated_at desc);

comment on table public.alpha_predictions is
  'Point-in-time StockBox Alpha model snapshots. Fundamental StockBox Score remains independent and is stored only for comparison.';
comment on table public.alpha_prediction_outcomes is
  'Realized point-in-time Alpha prediction outcomes. Rows are written only after the relevant horizon has elapsed.';
comment on column public.alpha_predictions.probabilities is
  'Model-implied ranking probabilities, not guaranteed investment outcomes.';
comment on column public.alpha_predictions.price_at_prediction is
  'Observed market price captured with the prediction so future outcome measurement does not reconstruct the entry price with hindsight.';

alter table public.alpha_predictions enable row level security;
alter table public.alpha_prediction_outcomes enable row level security;

-- Alpha rankings are served only through authenticated server routes using the
-- service role. No direct anon/authenticated table policies are intentionally
-- created, which prevents clients from bypassing product entitlement logic.
revoke all on public.alpha_predictions from anon, authenticated;
revoke all on public.alpha_prediction_outcomes from anon, authenticated;

commit;
