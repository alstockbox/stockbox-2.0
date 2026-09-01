begin;

create table if not exists public.analysis_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  previous_analysis_id uuid references public.analyses(id) on delete set null,
  change_kind text not null,
  severity text not null check (severity in ('info', 'watch', 'important')),
  direction text not null check (direction in ('supports', 'weakens', 'neutral')),
  title text not null,
  body text not null,
  metric text,
  before_value numeric,
  after_value numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists analysis_change_events_dedupe_idx
  on public.analysis_change_events (
    analysis_id,
    change_kind,
    coalesce(metric, ''),
    title
  );

create index if not exists analysis_change_events_user_ticker_idx
  on public.analysis_change_events (user_id, ticker, created_at desc);

alter table public.analysis_change_events enable row level security;
drop policy if exists analysis_change_events_select_own on public.analysis_change_events;
create policy analysis_change_events_select_own on public.analysis_change_events
  for select to authenticated using ((select auth.uid()) = user_id);

commit;
