create extension if not exists pgcrypto;

create table if not exists stockbox_profiles (
  owner_id text primary key default 'owner',
  plan_id text not null default 'free' check (plan_id in ('free', 'builder', 'pro')),
  base_currency text not null default 'SEK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stockbox_companies (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  exchange text,
  company_name text not null,
  currency text not null default 'SEK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (symbol, exchange)
);

create table if not exists stockbox_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  company_id uuid not null references stockbox_companies(id) on delete restrict,
  report_date date not null default current_date,
  stockbox_score integer check (stockbox_score is null or stockbox_score between 0 and 100),
  source_version text not null default 'manual-v1',
  created_at timestamptz not null default now()
);

create table if not exists stockbox_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  report_id uuid references stockbox_reports(id) on delete set null,
  company_id uuid not null references stockbox_companies(id) on delete restrict,
  snapshot_json jsonb not null,
  content_hash text not null,
  captured_at timestamptz not null default now(),
  unique (owner_id, content_hash)
);

create table if not exists stockbox_theses (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  company_id uuid not null references stockbox_companies(id) on delete restrict,
  report_snapshot_id uuid references stockbox_report_snapshots(id) on delete set null,
  status text not null default 'active' check (status in ('draft', 'active', 'reviewing', 'closed', 'archived')),
  thesis_type text not null default 'quick' check (thesis_type in ('quick', 'deep')),
  current_version integer not null default 1 check (current_version >= 1),
  review_due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stockbox_thesis_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  thesis_id uuid not null references stockbox_theses(id) on delete cascade,
  version integer not null check (version >= 1),
  summary text not null,
  why_now text,
  key_drivers text,
  valuation_view text,
  risks text,
  disconfirming_evidence text,
  time_horizon text,
  confidence integer check (confidence is null or confidence between 0 and 100),
  expected_scenario text,
  catalysts text,
  created_at timestamptz not null default now(),
  unique (thesis_id, version)
);

create table if not exists stockbox_paper_portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  name text not null,
  base_currency text not null default 'SEK',
  initial_cash_minor bigint not null check (initial_cash_minor >= 0),
  cash_minor bigint not null check (cash_minor >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stockbox_paper_positions (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  portfolio_id uuid not null references stockbox_paper_portfolios(id) on delete cascade,
  company_id uuid not null references stockbox_companies(id) on delete restrict,
  quantity numeric(28,10) not null check (quantity >= 0),
  cost_basis_minor bigint not null check (cost_basis_minor >= 0),
  realized_pnl_minor bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (portfolio_id, company_id)
);

create table if not exists stockbox_paper_trades (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  portfolio_id uuid not null references stockbox_paper_portfolios(id) on delete restrict,
  company_id uuid not null references stockbox_companies(id) on delete restrict,
  thesis_id uuid references stockbox_theses(id) on delete set null,
  report_snapshot_id uuid references stockbox_report_snapshots(id) on delete set null,
  idempotency_key text not null,
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(28,10) not null check (quantity > 0),
  execution_price numeric(28,8) not null check (execution_price > 0),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  currency text not null default 'SEK',
  simulated_fill_model text not null,
  market_data_timestamp timestamptz,
  executed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table if not exists stockbox_paper_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  portfolio_id uuid not null references stockbox_paper_portfolios(id) on delete cascade,
  trade_id uuid references stockbox_paper_trades(id) on delete restrict,
  entry_type text not null check (entry_type in ('initial_cash', 'buy_cash', 'sell_cash', 'fee', 'realized_pnl_adjustment', 'cash_adjustment')),
  amount_minor bigint not null,
  currency text not null default 'SEK',
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists stockbox_reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  thesis_id uuid references stockbox_theses(id) on delete set null,
  trade_id uuid references stockbox_paper_trades(id) on delete set null,
  classification text,
  user_notes text,
  lesson text,
  created_at timestamptz not null default now()
);

create table if not exists stockbox_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  scoring_version text not null,
  process_score integer check (process_score is null or process_score between 0 and 100),
  dimensions jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  sample_size integer not null default 0 check (sample_size >= 0),
  created_at timestamptz not null default now()
);

create table if not exists stockbox_dna_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  observation_type text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists stockbox_watchlist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  company_id uuid not null references stockbox_companies(id) on delete restrict,
  thesis_id uuid references stockbox_theses(id) on delete set null,
  reason text,
  waiting_for text,
  review_cadence text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, company_id)
);

create table if not exists stockbox_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null default 'owner' references stockbox_profiles(owner_id) on delete cascade,
  challenge_key text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  skill_tags text[] not null default '{}',
  progress jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists stockbox_reports_owner_company_idx on stockbox_reports(owner_id, company_id, report_date desc);
create index if not exists stockbox_theses_owner_status_idx on stockbox_theses(owner_id, status, review_due_on);
create index if not exists stockbox_thesis_versions_owner_thesis_idx on stockbox_thesis_versions(owner_id, thesis_id, version desc);
create index if not exists stockbox_trades_owner_portfolio_idx on stockbox_paper_trades(owner_id, portfolio_id, executed_at desc);
create index if not exists stockbox_positions_owner_portfolio_idx on stockbox_paper_positions(owner_id, portfolio_id);
create index if not exists stockbox_ledger_owner_portfolio_idx on stockbox_paper_ledger_entries(owner_id, portfolio_id, occurred_at desc);
create index if not exists stockbox_reviews_owner_created_idx on stockbox_reviews(owner_id, created_at desc);

alter table stockbox_profiles enable row level security;
alter table stockbox_companies enable row level security;
alter table stockbox_reports enable row level security;
alter table stockbox_report_snapshots enable row level security;
alter table stockbox_theses enable row level security;
alter table stockbox_thesis_versions enable row level security;
alter table stockbox_paper_portfolios enable row level security;
alter table stockbox_paper_positions enable row level security;
alter table stockbox_paper_trades enable row level security;
alter table stockbox_paper_ledger_entries enable row level security;
alter table stockbox_reviews enable row level security;
alter table stockbox_score_snapshots enable row level security;
alter table stockbox_dna_observations enable row level security;
alter table stockbox_watchlist_items enable row level security;
alter table stockbox_challenges enable row level security;

revoke all on stockbox_profiles from anon, authenticated;
revoke all on stockbox_companies from anon, authenticated;
revoke all on stockbox_reports from anon, authenticated;
revoke all on stockbox_report_snapshots from anon, authenticated;
revoke all on stockbox_theses from anon, authenticated;
revoke all on stockbox_thesis_versions from anon, authenticated;
revoke all on stockbox_paper_portfolios from anon, authenticated;
revoke all on stockbox_paper_positions from anon, authenticated;
revoke all on stockbox_paper_trades from anon, authenticated;
revoke all on stockbox_paper_ledger_entries from anon, authenticated;
revoke all on stockbox_reviews from anon, authenticated;
revoke all on stockbox_score_snapshots from anon, authenticated;
revoke all on stockbox_dna_observations from anon, authenticated;
revoke all on stockbox_watchlist_items from anon, authenticated;
revoke all on stockbox_challenges from anon, authenticated;

grant select, insert, update, delete on stockbox_profiles to service_role;
grant select, insert, update, delete on stockbox_companies to service_role;
grant select, insert, update, delete on stockbox_reports to service_role;
grant select, insert, update, delete on stockbox_report_snapshots to service_role;
grant select, insert, update, delete on stockbox_theses to service_role;
grant select, insert, update, delete on stockbox_thesis_versions to service_role;
grant select, insert, update, delete on stockbox_paper_portfolios to service_role;
grant select, insert, update, delete on stockbox_paper_positions to service_role;
grant select, insert, update, delete on stockbox_paper_trades to service_role;
grant select, insert, update, delete on stockbox_paper_ledger_entries to service_role;
grant select, insert, update, delete on stockbox_reviews to service_role;
grant select, insert, update, delete on stockbox_score_snapshots to service_role;
grant select, insert, update, delete on stockbox_dna_observations to service_role;
grant select, insert, update, delete on stockbox_watchlist_items to service_role;
grant select, insert, update, delete on stockbox_challenges to service_role;
