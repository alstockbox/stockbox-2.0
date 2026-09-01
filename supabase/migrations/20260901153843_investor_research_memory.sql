begin;

create table if not exists public.investment_theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'invalidated', 'closed')),
  title text not null,
  thesis text not null,
  assumptions jsonb not null default '[]'::jsonb,
  invalidation_triggers jsonb not null default '[]'::jsonb,
  target_metrics jsonb not null default '[]'::jsonb,
  notes text,
  last_analysis_id uuid references public.analyses(id) on delete set null,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investment_theses_active_ticker_idx
  on public.investment_theses (user_id, upper(ticker))
  where status in ('draft', 'active');

create index if not exists investment_theses_user_updated_idx
  on public.investment_theses (user_id, updated_at desc);

create table if not exists public.thesis_evidence_events (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references public.investment_theses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  analysis_id uuid references public.analyses(id) on delete set null,
  event_kind text not null
    check (event_kind in ('supports', 'weakens', 'invalidates', 'neutral', 'manual')),
  title text not null,
  body text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists thesis_evidence_events_thesis_created_idx
  on public.thesis_evidence_events (thesis_id, created_at desc);
create index if not exists thesis_evidence_events_user_created_idx
  on public.thesis_evidence_events (user_id, created_at desc);

alter table public.investment_theses enable row level security;
alter table public.thesis_evidence_events enable row level security;

drop policy if exists investment_theses_select_own on public.investment_theses;
create policy investment_theses_select_own on public.investment_theses
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists investment_theses_insert_own on public.investment_theses;
create policy investment_theses_insert_own on public.investment_theses
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists investment_theses_update_own on public.investment_theses;
create policy investment_theses_update_own on public.investment_theses
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists investment_theses_delete_own on public.investment_theses;
create policy investment_theses_delete_own on public.investment_theses
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists thesis_evidence_events_select_own on public.thesis_evidence_events;
create policy thesis_evidence_events_select_own on public.thesis_evidence_events
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists thesis_evidence_events_insert_own on public.thesis_evidence_events;
create policy thesis_evidence_events_insert_own on public.thesis_evidence_events
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and thesis_id in (
      select id from public.investment_theses where user_id = (select auth.uid())
    )
  );

commit;
