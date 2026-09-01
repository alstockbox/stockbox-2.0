begin;

create table if not exists public.batch_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','completed','partial','failed','cancelled')),
  analysis_type text not null check (analysis_type in ('summary','numbers','deep','research')),
  investment_profile text not null,
  total_items integer not null check (total_items between 1 and 50),
  completed_items integer not null default 0 check (completed_items >= 0),
  failed_items integer not null default 0 check (failed_items >= 0),
  cancelled_items integer not null default 0 check (cancelled_items >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists batch_runs_user_created_idx
  on public.batch_runs (user_id, created_at desc);

create table if not exists public.batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batch_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  input_ticker text not null,
  canonical_ticker text not null,
  company_name text not null,
  company jsonb not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  idempotency_key uuid not null,
  analysis_id uuid references public.analyses(id) on delete set null,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (batch_id, input_ticker),
  unique (user_id, idempotency_key)
);

create index if not exists batch_items_batch_status_idx
  on public.batch_items (batch_id, status, created_at);
create index if not exists batch_items_user_created_idx
  on public.batch_items (user_id, created_at desc);

alter table public.batch_runs enable row level security;
alter table public.batch_items enable row level security;

drop policy if exists batch_runs_select_own on public.batch_runs;
create policy batch_runs_select_own on public.batch_runs
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists batch_items_select_own on public.batch_items;
create policy batch_items_select_own on public.batch_items
  for select to authenticated using ((select auth.uid()) = user_id);

commit;
