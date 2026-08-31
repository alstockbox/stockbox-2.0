begin;

create table if not exists public.company_latest_metrics (
  ticker text primary key,
  company_name text not null,
  exchange text,
  country text,
  sector text,
  industry text,
  market_cap numeric,
  archetype text,
  analysis_id uuid references public.analyses(id) on delete set null,
  normalized jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists company_latest_metrics_classification_idx
  on public.company_latest_metrics (sector, industry, country, market_cap);
create index if not exists company_latest_metrics_updated_idx
  on public.company_latest_metrics (updated_at desc);

create table if not exists public.saved_screeners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  notification_preference text not null default 'in_app' check (notification_preference in ('none','in_app','email','in_app_email')),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.screener_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  saved_screener_id uuid not null references public.saved_screeners(id) on delete cascade,
  matched_tickers text[] not null default '{}',
  entered_tickers text[] not null default '{}',
  left_tickers text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists screener_snapshots_latest_idx
  on public.screener_snapshots (saved_screener_id, created_at desc);

create table if not exists public.peer_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  peer_tickers text[] not null default '{}',
  methodology jsonb not null default '{}'::jsonb,
  user_modified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create table if not exists public.earnings_events (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  fiscal_quarter text,
  fiscal_year integer,
  event_date timestamptz,
  reported_revenue numeric,
  estimated_revenue numeric,
  reported_eps numeric,
  estimated_eps numeric,
  operating_margin numeric,
  free_cash_flow numeric,
  source_provider text not null,
  source_url text,
  source_as_of timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticker, fiscal_year, fiscal_quarter, source_provider)
);

create index if not exists earnings_events_ticker_date_idx
  on public.earnings_events (ticker, event_date desc);

create table if not exists public.estimate_snapshots (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  captured_at timestamptz not null,
  revenue_consensus numeric,
  eps_consensus numeric,
  target_price numeric,
  analyst_count integer,
  high_estimate numeric,
  low_estimate numeric,
  source_provider text not null,
  source_as_of timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (ticker, captured_at, source_provider)
);

create index if not exists estimate_snapshots_ticker_captured_idx
  on public.estimate_snapshots (ticker, captured_at desc);

alter table public.company_latest_metrics enable row level security;
alter table public.saved_screeners enable row level security;
alter table public.screener_snapshots enable row level security;
alter table public.peer_sets enable row level security;
alter table public.earnings_events enable row level security;
alter table public.estimate_snapshots enable row level security;

create policy "company latest metrics authenticated read" on public.company_latest_metrics
  for select to authenticated using (true);
create policy "saved screeners own all" on public.saved_screeners
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "screener snapshots own read" on public.screener_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "peer sets own all" on public.peer_sets
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "earnings events authenticated read" on public.earnings_events
  for select to authenticated using (true);
create policy "estimate snapshots authenticated read" on public.estimate_snapshots
  for select to authenticated using (true);

grant select on public.company_latest_metrics, public.earnings_events, public.estimate_snapshots to authenticated;
grant select, insert, update, delete on public.saved_screeners, public.peer_sets to authenticated;
grant select on public.screener_snapshots to authenticated;

commit;
