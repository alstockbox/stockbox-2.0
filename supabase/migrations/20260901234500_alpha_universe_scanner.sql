begin;

create table public.alpha_universe_securities (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_key text not null,
  ticker text not null,
  company_name text not null,
  exchange text,
  country text,
  currency text,
  security_type text not null default 'common_stock',
  eligible boolean not null default true,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_key)
);

create table public.alpha_universe_memberships (
  id uuid primary key default gen_random_uuid(),
  universe_security_id uuid not null references public.alpha_universe_securities(id) on delete cascade,
  source_dataset text not null,
  source_as_of timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (universe_security_id, source_dataset, source_as_of)
);

create table public.alpha_scan_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  model_version text not null,
  status text not null check (status in ('running', 'completed', 'partial', 'failed')),
  requested_limit integer not null check (requested_limit > 0),
  candidate_count integer not null default 0,
  analyzed_count integer not null default 0,
  prediction_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  cursor_after text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.alpha_predictions alter column analysis_id drop not null;
alter table public.alpha_predictions add column universe_security_id uuid references public.alpha_universe_securities(id) on delete cascade;
alter table public.alpha_predictions add column scan_run_id uuid references public.alpha_scan_runs(id) on delete set null;

alter table public.alpha_predictions
  add constraint alpha_predictions_origin_check
  check (analysis_id is not null or universe_security_id is not null);

create unique index alpha_predictions_universe_model_asof_uidx
  on public.alpha_predictions (universe_security_id, model_version, prediction_as_of)
  where universe_security_id is not null;

create index alpha_universe_active_ticker_idx
  on public.alpha_universe_securities (eligible, ticker);
create index alpha_universe_last_seen_idx
  on public.alpha_universe_securities (last_seen_at desc);
create index alpha_universe_membership_active_idx
  on public.alpha_universe_memberships (source_dataset, active, source_as_of desc);
create index alpha_scan_runs_started_idx
  on public.alpha_scan_runs (started_at desc);
create index alpha_predictions_universe_time_idx
  on public.alpha_predictions (universe_security_id, prediction_as_of desc)
  where universe_security_id is not null;

comment on table public.alpha_universe_securities is
  'Server-owned security identities used by the StockBox Alpha market scanner. Source coverage must be stated explicitly.';
comment on table public.alpha_universe_memberships is
  'Point-in-time source membership observations. Historical rows are retained when securities leave a source universe.';
comment on table public.alpha_scan_runs is
  'Bounded scanner execution ledger used to audit market-universe Alpha generation.';

alter table public.alpha_universe_securities enable row level security;
alter table public.alpha_universe_memberships enable row level security;
alter table public.alpha_scan_runs enable row level security;

revoke all on public.alpha_universe_securities from anon, authenticated;
revoke all on public.alpha_universe_memberships from anon, authenticated;
revoke all on public.alpha_scan_runs from anon, authenticated;

commit;
