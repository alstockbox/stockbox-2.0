begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  experience text check (experience in ('beginner', 'intermediate', 'advanced')),
  ui_mode text not null default 'simple' check (ui_mode in ('simple', 'pro')),
  investment_profile text not null default 'balanced' check (investment_profile in ('long_term', 'short_term', 'growth', 'value', 'quality', 'dividend', 'balanced')),
  locale text not null default 'en' check (locale in ('en', 'sv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  key text primary key,
  name text not null,
  monthly_price_sek integer not null check (monthly_price_sek >= 0),
  entitlements jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  plan_key text not null default 'free' references public.plans(key),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  country text,
  sector text,
  industry text,
  provider_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.securities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticker text not null,
  exchange text,
  currency text,
  isin text,
  active boolean not null default true,
  unique (ticker, exchange)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  ticker text not null,
  company_name text not null,
  analysis_type text not null check (analysis_type in ('summary', 'numbers', 'deep')),
  investment_profile text not null,
  score numeric(5,2),
  personalized_score numeric(5,2),
  confidence numeric(5,2),
  recommendation text not null,
  model_version text not null,
  report jsonb not null,
  provider_warnings jsonb not null default '[]'::jsonb,
  estimated_cost_sek numeric(12,6) not null default 0,
  provider_call_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.analysis_sections (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  section_key text not null,
  content jsonb not null,
  sort_order integer not null default 0,
  unique (analysis_id, section_key)
);

create table public.analysis_scores (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  dimension text not null,
  score numeric(5,2),
  weight numeric(7,6) not null,
  contributors jsonb not null default '[]'::jsonb,
  unique (analysis_id, dimension)
);

create table public.analysis_sources (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  provider text not null,
  source_url text not null,
  as_of timestamptz,
  accessed_at timestamptz not null default now()
);

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  alert_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, ticker)
);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  base_currency text not null default 'SEK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  ticker text not null,
  quantity numeric(24,8) not null check (quantity > 0),
  average_cost numeric(24,8) not null check (average_cost >= 0),
  currency text not null,
  acquired_at date,
  created_at timestamptz not null default now()
);

create table public.news_articles (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_id text not null,
  title text not null,
  url text not null,
  published_at timestamptz not null,
  tickers text[] not null default '{}',
  impact jsonb,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_id),
  unique (content_hash)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid references public.profiles(id) on delete set null,
  code text not null unique,
  status text not null default 'pending',
  reward_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  code text not null unique,
  status text not null default 'pending',
  commission_basis_points integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.provider_health (
  id bigint generated always as identity primary key,
  provider text not null,
  operation text not null,
  ok boolean not null,
  latency_ms integer,
  status_code integer,
  error_class text,
  created_at timestamptz not null default now()
);

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.error_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  service text not null,
  sanitized_error text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  rollout_percentage integer not null default 0 check (rollout_percentage between 0 and 100),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.admin_alert_deliveries (
  analysis_id uuid primary key references public.analyses(id) on delete cascade,
  ticker text not null,
  model_version text not null,
  reserved_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text
);

insert into public.plans (key, name, monthly_price_sek, entitlements) values
  ('free', 'Free', 0, '{"monthlyAnalyses":5,"deepAnalyses":1,"watchlistItems":5,"batchRows":0,"portfolios":1,"aiAssistant":false,"hourlyAlerts":false}'),
  ('basic', 'Basic', 79, '{"monthlyAnalyses":30,"deepAnalyses":8,"watchlistItems":20,"batchRows":10,"portfolios":2,"aiAssistant":false,"hourlyAlerts":false}'),
  ('standard', 'Standard', 149, '{"monthlyAnalyses":100,"deepAnalyses":30,"watchlistItems":75,"batchRows":50,"portfolios":5,"aiAssistant":true,"hourlyAlerts":true}'),
  ('premium', 'Premium', 299, '{"monthlyAnalyses":300,"deepAnalyses":120,"watchlistItems":250,"batchRows":250,"portfolios":15,"aiAssistant":true,"hourlyAlerts":true}'),
  ('elite', 'Elite', 599, '{"monthlyAnalyses":1000,"deepAnalyses":400,"watchlistItems":1000,"batchRows":1000,"portfolios":50,"aiAssistant":true,"hourlyAlerts":true}')
on conflict (key) do update set name = excluded.name, monthly_price_sek = excluded.monthly_price_sek, entitlements = excluded.entitlements, updated_at = now();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  insert into public.subscriptions (user_id, plan_key, status) values (new.id, 'free', 'active') on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create index analyses_user_created_idx on public.analyses (user_id, created_at desc);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create index watchlists_user_idx on public.watchlists (user_id);
create index portfolios_user_idx on public.portfolios (user_id);
create index holdings_portfolio_idx on public.holdings (portfolio_id);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index usage_events_user_event_idx on public.usage_events (user_id, event, created_at desc);
create index share_links_creator_idx on public.share_links (created_by);
create index analysis_sections_analysis_idx on public.analysis_sections (analysis_id);
create index analysis_scores_analysis_idx on public.analysis_scores (analysis_id);
create index analysis_sources_analysis_idx on public.analysis_sources (analysis_id);
create index background_jobs_queue_idx on public.background_jobs (status, available_at);
create index provider_health_provider_idx on public.provider_health (provider, created_at desc);

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.companies enable row level security;
alter table public.securities enable row level security;
alter table public.analyses enable row level security;
alter table public.analysis_sections enable row level security;
alter table public.analysis_scores enable row level security;
alter table public.analysis_sources enable row level security;
alter table public.watchlists enable row level security;
alter table public.portfolios enable row level security;
alter table public.holdings enable row level security;
alter table public.news_articles enable row level security;
alter table public.notifications enable row level security;
alter table public.share_links enable row level security;
alter table public.referrals enable row level security;
alter table public.affiliates enable row level security;
alter table public.usage_events enable row level security;
alter table public.provider_health enable row level security;
alter table public.background_jobs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.error_logs enable row level security;
alter table public.feature_flags enable row level security;
alter table public.admin_alert_deliveries enable row level security;

create policy "plans are readable" on public.plans for select to anon, authenticated using (active = true);
create policy "profiles select own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id and role = 'customer');
create policy "subscriptions select own" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "credits select own" on public.credit_ledger for select to authenticated using ((select auth.uid()) = user_id);
create policy "analyses select own" on public.analyses for select to authenticated using ((select auth.uid()) = user_id);
create policy "watchlists own all" on public.watchlists for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "portfolios own all" on public.portfolios for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "holdings select own" on public.holdings for select to authenticated using (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));
create policy "holdings insert own" on public.holdings for insert to authenticated with check (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));
create policy "holdings update own" on public.holdings for update to authenticated using (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid()))) with check (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));
create policy "holdings delete own" on public.holdings for delete to authenticated using (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));
create policy "notifications select own" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "notifications update own" on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "share links own select" on public.share_links for select to authenticated using ((select auth.uid()) = created_by);
create policy "share links own update" on public.share_links for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "referrals select related" on public.referrals for select to authenticated using ((select auth.uid()) = referrer_id or (select auth.uid()) = referred_id);
create policy "affiliates select own" on public.affiliates for select to authenticated using ((select auth.uid()) = user_id);
create policy "usage select own" on public.usage_events for select to authenticated using ((select auth.uid()) = user_id);

revoke all on schema private from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.plans to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.subscriptions, public.credit_ledger, public.analyses, public.notifications, public.share_links, public.referrals, public.affiliates, public.usage_events to authenticated;
grant select, insert, update, delete on public.watchlists, public.portfolios, public.holdings to authenticated;

commit;
