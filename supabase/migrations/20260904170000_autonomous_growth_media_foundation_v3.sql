-- StockBox Autonomous Growth Engine v3 foundation.
-- Additive only: existing v2 acquisition tables, including acq_distribution_queue, are preserved.

create table if not exists public.acq_voice_profiles (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  language text not null check (language in ('sv','en')),
  provider text not null,
  model text,
  storage_bucket text not null default 'growth-voice-private' check (storage_bucket = 'growth-voice-private'),
  storage_path text not null,
  status text not null default 'draft' check (status in ('draft','testing','active','disabled','failed')),
  consent_at timestamptz not null,
  version integer not null default 1 check (version >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.acq_render_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  content_id uuid not null references public.acq_content(id) on delete cascade,
  voice_profile_id uuid references public.acq_voice_profiles(id) on delete set null,
  state text not null check (state in ('queued','storyboarding','voicing','rendering','qc','ready','failed','superseded')),
  template text not null check (template in ('educational_checklist','stock_analysis','investor_warning','stockbox_demo','company_comparison')),
  language text not null check (language in ('sv','en')),
  provider text,
  render_spec jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  failure_reason text,
  worker_id text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.acq_media_assets (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  content_id uuid not null references public.acq_content(id) on delete cascade,
  render_job_id uuid references public.acq_render_jobs(id) on delete cascade,
  kind text not null check (kind in ('voice_audio','screenshot','generated_scene','master_video','cover','carousel_slide','carousel_zip','static_image','metadata')),
  bucket text not null check (bucket in ('growth-voice-private','growth-render-staging','growth-ready-assets')),
  storage_path text not null,
  mime_type text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  qc_status text not null default 'pending' check (qc_status in ('pending','passed','failed','not_required')),
  qc_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create table if not exists public.acq_distribution_packages (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  content_id uuid not null references public.acq_content(id) on delete cascade,
  render_job_id uuid references public.acq_render_jobs(id) on delete cascade,
  master_asset_id uuid references public.acq_media_assets(id) on delete set null,
  platform text not null check (platform in ('instagram_reel','facebook_reel','tiktok','youtube_short','instagram_carousel','linkedin','facebook')),
  title text,
  caption text,
  description text,
  utm_url text,
  recommended_time text,
  status text not null default 'draft' check (status in ('draft','ready','posted','deferred','failed')),
  daily_rank integer check (daily_rank is null or daily_rank >= 1),
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (render_job_id, platform)
);

create table if not exists public.acq_budget_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  provider text not null,
  operation text not null,
  content_id uuid references public.acq_content(id) on delete set null,
  render_job_id uuid references public.acq_render_jobs(id) on delete set null,
  estimated_sek numeric(12,6) not null default 0 check (estimated_sek >= 0),
  actual_sek numeric(12,6) check (actual_sek is null or actual_sek >= 0),
  original_currency text,
  original_amount numeric(18,8) check (original_amount is null or original_amount >= 0),
  billing_period date not null default (date_trunc('month', now())::date),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.acq_manual_script_ideas (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  content_id uuid references public.acq_content(id) on delete set null,
  suggested_for_date date not null,
  language text not null default 'sv' check (language in ('sv','en')),
  hook text not null,
  script text not null,
  screen_directions text,
  caption text,
  cta text,
  recommended_platform text check (recommended_platform is null or recommended_platform in ('instagram_reel','facebook_reel','tiktok','youtube_short','instagram_carousel','linkedin','facebook')),
  status text not null default 'suggested' check (status in ('suggested','saved','recorded','dismissed','expired')),
  automatic_render boolean not null default false check (automatic_render = false),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acq_render_jobs_state_created_idx
  on public.acq_render_jobs(state, created_at);
create index if not exists acq_media_assets_job_kind_idx
  on public.acq_media_assets(render_job_id, kind);
create index if not exists acq_distribution_packages_status_rank_idx
  on public.acq_distribution_packages(status, daily_rank, created_at desc);
create index if not exists acq_budget_ledger_created_idx
  on public.acq_budget_ledger(created_at);
create index if not exists acq_manual_script_ideas_date_idx
  on public.acq_manual_script_ideas(suggested_for_date desc);

alter table public.acq_voice_profiles enable row level security;
alter table public.acq_render_jobs enable row level security;
alter table public.acq_media_assets enable row level security;
alter table public.acq_distribution_packages enable row level security;
alter table public.acq_budget_ledger enable row level security;
alter table public.acq_manual_script_ideas enable row level security;

-- No anon/authenticated policies are created here. Server-side service-role access remains the control plane.

insert into storage.buckets (id, name, public)
values
  ('growth-voice-private', 'growth-voice-private', false),
  ('growth-render-staging', 'growth-render-staging', false),
  ('growth-ready-assets', 'growth-ready-assets', false)
on conflict (id) do update set public = false;

insert into public.acq_config (key, value, value_type, description)
values
  ('growth_budget_target_sek', '50', 'number', 'Target monthly recurring spend for the autonomous growth engine'),
  ('growth_budget_hard_cap_sek', '75', 'number', 'Absolute monthly ceiling for intentionally authorized growth-engine spend'),
  ('growth_v3_shadow_mode', 'true', 'boolean', 'Keep v3 render/package output hidden from READY while validating the pipeline'),
  ('growth_v3_daily_master_video_max', '2', 'number', 'Maximum automatic master videos selected per day'),
  ('growth_render_max_attempts', '2', 'number', 'Maximum render-worker claim attempts before a job fails'),
  ('growth_signed_url_ttl_seconds', '600', 'number', 'Default short-lived signed asset URL lifetime'),
  ('growth_ready_retention_days', '60', 'number', 'Default retention period for unpublished ready assets'),
  ('growth_allocation_exploit_ratio', '0.70', 'number', 'Initial exploit allocation ratio'),
  ('growth_allocation_explore_ratio', '0.20', 'number', 'Initial explore allocation ratio'),
  ('growth_allocation_longshot_ratio', '0.10', 'number', 'Initial long-shot/diversification allocation ratio')
on conflict (key) do nothing;
