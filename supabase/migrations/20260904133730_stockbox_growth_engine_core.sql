-- StockBox Growth Engine v2 core baseline.
-- Reconstructed from the production catalog on 2026-09-05 because the
-- production migration 20260904133730 existed in Supabase history but its
-- source file was missing from Git. This migration intentionally contains
-- schema only plus safe non-secret defaults. No production secrets are
-- embedded here.
--
-- Safety properties:
-- * additive / CREATE IF NOT EXISTS
-- * RLS enabled for all Growth control-plane tables
-- * no anon/authenticated policies are created
-- * service-role remains the intended control plane
-- * later v2/v3 migrations stay responsible for their own additive changes

create extension if not exists pgcrypto;

create table if not exists public.acq_opportunities (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  type text,
  topic text,
  ticker text,
  company text,
  market text default 'SE'::text,
  language text default 'sv'::text,
  audience text,
  hook_angle text,
  channel_fit text,
  search_intent text,
  freshness numeric,
  stockbox_relevance numeric,
  traffic_potential numeric,
  competition_proxy numeric,
  historical_similarity numeric,
  estimated_effort numeric,
  priority_score numeric,
  score_breakdown jsonb default '{}'::jsonb,
  source_url text,
  source_feed text,
  status text default 'discovered'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.acq_content (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  opportunity_id uuid references public.acq_opportunities(id),
  campaign_id text,
  platform text,
  topic text,
  ticker text,
  company text,
  audience text,
  hook_type text,
  format text,
  cta text,
  language text default 'sv'::text,
  pillar text,
  title text,
  body text,
  script text,
  utm_url text,
  status text default 'draft'::text,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.acq_content_variants (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  content_id uuid references public.acq_content(id),
  platform text,
  hook text,
  caption text,
  script text,
  media_instructions text,
  cta text,
  utm_url text,
  recommended_time text,
  status text default 'draft'::text,
  created_at timestamptz default now()
);

create table if not exists public.acq_distribution_queue (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  variant_id uuid references public.acq_content_variants(id),
  content_id uuid references public.acq_content(id),
  platform text,
  caption text,
  script text,
  media_instructions text,
  cta text,
  utm_url text,
  recommended_time text,
  status text default 'pending_approval'::text,
  approved_by text,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  quality_score integer not null default 0,
  quality_flags jsonb not null default '[]'::jsonb,
  daily_rank integer,
  generation_version text,
  asset_kind text,
  asset_copy jsonb not null default '{}'::jsonb
);

create table if not exists public.acq_creators (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  name text,
  platform text,
  profile_url text,
  country text default 'SE'::text,
  language text default 'sv'::text,
  topic text,
  audience_size integer,
  engagement_proxy numeric,
  stockbox_fit numeric,
  audience_fit numeric,
  estimated_reply_probability numeric,
  traffic_potential numeric,
  affiliate_fit numeric,
  creator_score numeric,
  score_breakdown jsonb default '{}'::jsonb,
  contact_method text,
  status text default 'discovered'::text,
  last_contacted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.acq_creator_outreach (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  creator_id uuid references public.acq_creators(id),
  channel text,
  message text,
  offer text,
  followup_number integer default 0,
  status text default 'queued'::text,
  created_at timestamptz default now()
);

create table if not exists public.acq_config (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text,
  value_type text default 'string'::text,
  description text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists public.acq_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null unique,
  unique_visitors integer default 0,
  qualified_unique_visitors integer default 0,
  website_clicks integer default 0,
  returning_visitors integer default 0,
  rolling_7d_avg numeric,
  attribution_rate numeric,
  by_source jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.acq_channel_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  channel text not null,
  unique_visitors integer default 0,
  clicks integer default 0,
  created_at timestamptz default now(),
  unique (metric_date, channel)
);

create table if not exists public.acq_content_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  content_id text not null,
  unique_visitors integer default 0,
  clicks integer default 0,
  created_at timestamptz default now(),
  unique (metric_date, content_id)
);

create table if not exists public.acq_creator_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  creator_id text not null,
  unique_visitors integer default 0,
  clicks integer default 0,
  created_at timestamptz default now(),
  unique (metric_date, creator_id)
);

create table if not exists public.acq_experiments (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  hypothesis text,
  dimension text,
  status text default 'running'::text,
  sample integer default 0,
  result jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.acq_growth_decisions (
  id uuid primary key default gen_random_uuid(),
  decision text,
  reason text,
  supporting_metrics jsonb default '{}'::jsonb,
  confidence numeric,
  expected_effect text,
  created_at timestamptz default now()
);

create table if not exists public.acq_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  intent text,
  cluster text,
  market text default 'SE'::text,
  language text default 'sv'::text,
  stockbox_relevance numeric,
  traffic_potential numeric,
  competition_proxy numeric,
  evergreen_value numeric,
  click_potential numeric,
  score numeric,
  score_breakdown jsonb default '{}'::jsonb,
  status text default 'discovered'::text,
  created_at timestamptz default now()
);

create table if not exists public.acq_seo_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  template text,
  keyword text,
  ticker text,
  title text,
  brief text,
  status text default 'planned'::text,
  last_refreshed_at timestamptz,
  created_at timestamptz default now(),
  body text,
  meta_description text,
  updated_at timestamptz default now(),
  published_at timestamptz
);

create table if not exists public.acq_seo_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_date date not null,
  seo_page text not null,
  unique_visitors integer default 0,
  clicks integer default 0,
  created_at timestamptz default now(),
  unique (metric_date, seo_page)
);

create table if not exists public.acq_suppression (
  id uuid primary key default gen_random_uuid(),
  identifier text not null unique,
  reason text,
  created_at timestamptz default now()
);

create table if not exists public.acq_errors (
  id uuid primary key default gen_random_uuid(),
  source text,
  error_type text,
  message text,
  context jsonb default '{}'::jsonb,
  occurred_at timestamptz default now()
);

create table if not exists public.acq_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow text not null,
  status text,
  records_processed integer default 0,
  errors integer default 0,
  duration_ms integer,
  detail jsonb default '{}'::jsonb,
  ran_at timestamptz default now()
);

create table if not exists public.acq_engine_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  mode text not null,
  status text not null,
  detail jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.acq_founder_briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date not null default current_date unique,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.acq_events (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  idempotency_key text not null unique,
  event_name text not null,
  anonymous_id text,
  user_id text,
  session_id text,
  campaign_id text,
  content_id text,
  creator_id text,
  experiment_id text,
  variant_id text,
  channel text,
  source text,
  medium text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  page text,
  landing_page text,
  referrer text,
  country text,
  language text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  is_bot boolean default false,
  is_internal boolean default false
);

-- Indexes observed on the live v2 control-plane schema. Duplicate historical
-- event indexes are intentionally not reproduced; the canonical set below
-- preserves query access paths without retaining redundant indexes.
create index if not exists acq_opps_status_idx
  on public.acq_opportunities(status, priority_score desc);
create index if not exists acq_queue_status_idx
  on public.acq_distribution_queue(status);
create index if not exists acq_distribution_queue_daily_quality_idx
  on public.acq_distribution_queue(status, daily_rank, quality_score desc, created_at desc);
create index if not exists acq_engine_runs_started_idx
  on public.acq_engine_runs(started_at desc);
create index if not exists acq_founder_briefs_date_idx
  on public.acq_founder_briefs(brief_date desc);
create index if not exists acq_runs_wf_idx
  on public.acq_workflow_runs(workflow, ran_at);
create index if not exists acq_seo_pages_status_idx
  on public.acq_seo_pages(status, created_at desc);
create index if not exists acq_seo_pages_published_idx
  on public.acq_seo_pages(published_at desc) where published_at is not null;
create index if not exists idx_acq_events_occurred_at
  on public.acq_events(occurred_at desc);
create index if not exists idx_acq_events_event_name
  on public.acq_events(event_name);
create index if not exists idx_acq_events_anonymous_id
  on public.acq_events(anonymous_id);
create index if not exists idx_acq_events_user_id
  on public.acq_events(user_id);
create index if not exists idx_acq_events_campaign_id
  on public.acq_events(campaign_id);
create index if not exists idx_acq_events_content_id
  on public.acq_events(content_id);
create index if not exists idx_acq_events_channel
  on public.acq_events(channel);
create index if not exists idx_acq_events_utm_campaign
  on public.acq_events(utm_campaign);

alter table public.acq_opportunities enable row level security;
alter table public.acq_content enable row level security;
alter table public.acq_content_variants enable row level security;
alter table public.acq_distribution_queue enable row level security;
alter table public.acq_creators enable row level security;
alter table public.acq_creator_outreach enable row level security;
alter table public.acq_config enable row level security;
alter table public.acq_daily_metrics enable row level security;
alter table public.acq_channel_metrics enable row level security;
alter table public.acq_content_metrics enable row level security;
alter table public.acq_creator_metrics enable row level security;
alter table public.acq_experiments enable row level security;
alter table public.acq_growth_decisions enable row level security;
alter table public.acq_keywords enable row level security;
alter table public.acq_seo_pages enable row level security;
alter table public.acq_seo_metrics enable row level security;
alter table public.acq_suppression enable row level security;
alter table public.acq_errors enable row level security;
alter table public.acq_workflow_runs enable row level security;
alter table public.acq_engine_runs enable row level security;
alter table public.acq_founder_briefs enable row level security;
alter table public.acq_events enable row level security;

-- Safe baseline defaults only. Sensitive values (for example orchestrator
-- tokens) must be supplied through secrets/admin configuration and are never
-- committed to Git.
insert into public.acq_config (key, value, value_type, description)
values
  ('engine_content_version', 'v2', 'string', 'Growth content generation version'),
  ('engine_daily_content_limit', '6', 'number', 'Maximum master content items per engine run'),
  ('engine_daily_queue_limit', '6', 'number', 'Maximum founder approval queue items per daily rebalance'),
  ('engine_min_quality_score', '72', 'number', 'Minimum deterministic quality score for approval-queue eligibility'),
  ('creator_auto_outreach', 'false', 'boolean', 'Queue creator outreach drafts only; never auto-send'),
  ('daily_content_limit', '6', 'number', 'Maximum content items produced per day'),
  ('max_followups', '2', 'number', 'Maximum creator follow-ups'),
  ('outreach_limit_per_day', '10', 'number', 'Maximum creator outreach drafts queued per day'),
  ('primary_language', 'sv', 'string', 'Primary launch language'),
  ('primary_market', 'SE', 'string', 'Primary launch market')
on conflict (key) do nothing;
