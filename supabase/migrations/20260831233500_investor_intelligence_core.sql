begin;

create table if not exists public.company_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  captured_at timestamptz not null,
  price numeric,
  score numeric(7,3),
  personalized_score numeric(7,3),
  confidence numeric(7,6),
  coverage numeric(7,6),
  fair_value numeric,
  fair_value_upside numeric,
  pe numeric,
  historical_pe_percentile numeric(7,6),
  fcf_yield numeric,
  dividend_yield numeric,
  normalized jsonb not null,
  created_at timestamptz not null default now(),
  unique (analysis_id)
);

create table if not exists public.investment_theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  title text not null,
  status text not null default 'INTACT' check (status in ('STRONG','INTACT','WATCH','WEAKENING','BROKEN','ARCHIVED')),
  initial_thesis_date date not null default current_date,
  last_reviewed_at timestamptz,
  notes text,
  fair_value_target numeric,
  preferred_buy_price numeric,
  required_margin_of_safety numeric check (required_margin_of_safety is null or required_margin_of_safety between 0 and 1),
  risk_notes text,
  positive_catalysts jsonb not null default '[]'::jsonb,
  invalidation_conditions text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_thesis_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  label text not null,
  metric_key text not null,
  operator text not null check (operator in ('gt','gte','lt','lte','eq','between')),
  threshold jsonb not null,
  critical boolean not null default false,
  failure_status text not null default 'WATCH' check (failure_status in ('WATCH','WEAKENING','BROKEN')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_thesis_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  analysis_id uuid references public.analyses(id) on delete set null,
  snapshot_id uuid references public.company_metric_snapshots(id) on delete set null,
  previous_status text not null check (previous_status in ('STRONG','INTACT','WATCH','WEAKENING','BROKEN','ARCHIVED')),
  new_status text not null check (new_status in ('STRONG','INTACT','WATCH','WEAKENING','BROKEN','ARCHIVED')),
  results jsonb not null,
  reasoning jsonb not null default '[]'::jsonb,
  newly_failed text[] not null default '{}',
  newly_recovered text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.material_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  previous_snapshot_id uuid references public.company_metric_snapshots(id) on delete set null,
  current_snapshot_id uuid not null references public.company_metric_snapshots(id) on delete cascade,
  metric_key text not null,
  category text not null check (category in ('price','valuation','business','stockbox','estimates','dividend','risk')),
  previous_value numeric,
  current_value numeric,
  absolute_change numeric,
  relative_change numeric,
  materiality text not null check (materiality in ('NONE','MINOR','IMPORTANT','THESIS_CHANGING')),
  reasoning text not null,
  created_at timestamptz not null default now(),
  unique (current_snapshot_id, metric_key)
);

create table if not exists public.user_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  kind text not null,
  metric_key text not null,
  operator text not null check (operator in ('below','above','crosses_below','crosses_above','change_abs_gte')),
  threshold numeric not null,
  enabled boolean not null default true,
  delivery_channels text[] not null default array['in_app']::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_id uuid not null references public.user_alerts(id) on delete cascade,
  snapshot_id uuid references public.company_metric_snapshots(id) on delete set null,
  event_key text not null unique,
  metric_key text not null,
  prior_value numeric,
  trigger_value numeric,
  threshold numeric,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'triggered' check (status in ('triggered','acknowledged','delivery_failed')),
  triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.monitoring_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  last_snapshot_id uuid references public.company_metric_snapshots(id) on delete set null,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  next_check_at timestamptz,
  refresh_reason text,
  status text not null default 'NO_NEW_DATA' check (status in ('SUCCESS','PARTIAL','NO_NEW_DATA','PROVIDER_UNAVAILABLE','INSUFFICIENT_DATA','FAILED')),
  last_error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create table if not exists public.weekly_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  content jsonb not null,
  email_delivery_status text not null default 'not_requested' check (email_delivery_status in ('not_requested','pending','sent','failed','unsupported')),
  created_at timestamptz not null default now(),
  unique (user_id, period_start, period_end),
  check (period_end >= period_start)
);

create table if not exists public.investor_user_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_dashboard_visit_at timestamptz,
  last_brief_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investment_theses_one_active_per_ticker_idx
  on public.investment_theses (user_id, ticker)
  where archived_at is null;
create index if not exists company_metric_snapshots_user_ticker_idx
  on public.company_metric_snapshots (user_id, ticker, captured_at desc);
create index if not exists company_metric_snapshots_watchlist_idx
  on public.company_metric_snapshots (user_id, score desc, fair_value_upside desc);
create index if not exists investment_thesis_rules_thesis_idx
  on public.investment_thesis_rules (thesis_id, enabled);
create index if not exists investment_thesis_evaluations_thesis_idx
  on public.investment_thesis_evaluations (thesis_id, created_at desc);
create index if not exists material_changes_user_created_idx
  on public.material_changes (user_id, created_at desc, materiality);
create index if not exists material_changes_ticker_idx
  on public.material_changes (user_id, ticker, created_at desc);
create index if not exists user_alerts_user_ticker_idx
  on public.user_alerts (user_id, ticker, enabled);
create index if not exists alert_events_user_created_idx
  on public.alert_events (user_id, triggered_at desc);
create index if not exists monitoring_state_due_idx
  on public.monitoring_state (next_check_at) where next_check_at is not null;
create index if not exists weekly_briefs_user_period_idx
  on public.weekly_briefs (user_id, period_end desc);

alter table public.company_metric_snapshots enable row level security;
alter table public.investment_theses enable row level security;
alter table public.investment_thesis_rules enable row level security;
alter table public.investment_thesis_evaluations enable row level security;
alter table public.material_changes enable row level security;
alter table public.user_alerts enable row level security;
alter table public.alert_events enable row level security;
alter table public.monitoring_state enable row level security;
alter table public.weekly_briefs enable row level security;
alter table public.investor_user_state enable row level security;

create policy "company snapshots select own" on public.company_metric_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "investment theses own all" on public.investment_theses
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "investment thesis rules own all" on public.investment_thesis_rules
  for all to authenticated using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and thesis_id in (select id from public.investment_theses where user_id = (select auth.uid()))
  );

create policy "thesis evaluations select own" on public.investment_thesis_evaluations
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "material changes select own" on public.material_changes
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "user alerts own all" on public.user_alerts
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "alert events select own" on public.alert_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "alert events acknowledge own" on public.alert_events
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "monitoring state select own" on public.monitoring_state
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "weekly briefs select own" on public.weekly_briefs
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "investor user state own all" on public.investor_user_state
  for all to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select on public.company_metric_snapshots, public.investment_thesis_evaluations,
  public.material_changes, public.monitoring_state, public.weekly_briefs to authenticated;
grant select, insert, update, delete on public.investment_theses, public.investment_thesis_rules,
  public.user_alerts to authenticated;
grant select, update on public.alert_events to authenticated;
grant select, insert, update on public.investor_user_state to authenticated;

commit;
