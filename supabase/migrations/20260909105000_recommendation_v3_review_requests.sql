begin;

create table if not exists public.analysis_recommendation_v3_review_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  dedupe_key text not null unique,
  policy_version text not null,
  ticker text not null check (btrim(ticker) <> ''),
  requested_at timestamptz not null,
  trigger text not null check (trigger in ('MATERIAL_NEWS', 'LIFECYCLE_RECONSIDER')),
  priority text not null check (priority in ('normal', 'high', 'urgent')),
  requested_action text not null check (requested_action = 'RECOMPUTE_OBJECTIVE_RECOMMENDATION'),
  source_id text not null check (btrim(source_id) <> ''),
  source_observed_at timestamptz not null,
  materiality integer check (materiality is null or (materiality >= 0 and materiality <= 100)),
  evidence_ids text[] not null default '{}'::text[],
  reason_codes text[] not null default '{}'::text[],
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analysis_recommendation_v3_review_request_status_time check (
    (status = 'PENDING' and claimed_at is null and completed_at is null)
    or (status = 'PROCESSING' and claimed_at is not null and completed_at is null)
    or (status = 'COMPLETED' and claimed_at is not null and completed_at is not null)
    or (status = 'FAILED' and claimed_at is not null)
  )
);

create index if not exists analysis_recommendation_v3_review_requests_pending_idx
  on public.analysis_recommendation_v3_review_requests (status, priority, requested_at asc);
create index if not exists analysis_recommendation_v3_review_requests_ticker_idx
  on public.analysis_recommendation_v3_review_requests (ticker, requested_at desc);

alter table public.analysis_recommendation_v3_review_requests enable row level security;
revoke all on table public.analysis_recommendation_v3_review_requests from public;
revoke all on table public.analysis_recommendation_v3_review_requests from anon;
revoke all on table public.analysis_recommendation_v3_review_requests from authenticated;
grant select, insert, update on table public.analysis_recommendation_v3_review_requests to service_role;

comment on table public.analysis_recommendation_v3_review_requests is
  'Private StockBox 3.0 objective recommendation re-analysis queue. Requests carry evidence references only and cannot prescribe a target rating.';

commit;
