begin;

alter table public.watchlists
  add column if not exists monitoring_enabled boolean not null default true,
  add column if not exists monitoring_frequency text not null default 'daily',
  add column if not exists last_checked_at timestamptz,
  add column if not exists next_check_at timestamptz not null default now(),
  add column if not exists last_monitor_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'watchlists_monitoring_frequency_check'
  ) then
    alter table public.watchlists
      add constraint watchlists_monitoring_frequency_check
      check (monitoring_frequency in ('daily', 'weekly'));
  end if;
end $$;

create table if not exists public.monitoring_snapshots (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  signal_kind text not null check (signal_kind in ('insider', 'short_interest', 'filing')),
  signal_hash text not null,
  data_as_of timestamptz,
  payload jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (watchlist_id, signal_kind)
);

create table if not exists public.monitoring_events (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ticker text not null,
  signal_kind text not null check (signal_kind in ('insider', 'short_interest', 'filing')),
  severity text not null default 'info' check (severity in ('info', 'watch', 'important')),
  signal_hash text not null,
  title text not null,
  body text not null,
  data_as_of timestamptz,
  source_metadata jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, watchlist_id, signal_kind, signal_hash)
);

create index if not exists watchlists_monitoring_due_idx
  on public.watchlists (next_check_at)
  where monitoring_enabled = true;
create index if not exists monitoring_events_user_created_idx
  on public.monitoring_events (user_id, created_at desc);
create index if not exists monitoring_snapshots_watchlist_idx
  on public.monitoring_snapshots (watchlist_id, signal_kind);

alter table public.monitoring_snapshots enable row level security;
alter table public.monitoring_events enable row level security;

drop policy if exists monitoring_snapshots_select_own on public.monitoring_snapshots;
create policy monitoring_snapshots_select_own on public.monitoring_snapshots
  for select using (auth.uid() = user_id);

drop policy if exists monitoring_events_select_own on public.monitoring_events;
create policy monitoring_events_select_own on public.monitoring_events
  for select using (auth.uid() = user_id);

commit;
