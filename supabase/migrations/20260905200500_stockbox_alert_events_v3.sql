begin;

create table if not exists public.stockbox_alert_events_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  watchlist_id uuid references public.watchlists(id) on delete cascade,
  ticker text not null check (char_length(ticker) between 1 and 32),
  alert_kind text not null check (alert_kind in ('RECOMMENDATION_CHANGE','CONVICTION_DROP','DATA_QUALITY_DROP','PRICE_ABOVE','PRICE_BELOW')),
  severity text not null check (severity in ('info','watch','important')),
  policy_version text not null,
  dedupe_key text not null,
  source_analysis_id text,
  message_key text not null,
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists stockbox_alert_events_v3_user_created_idx
  on public.stockbox_alert_events_v3 (user_id, created_at desc);
create index if not exists stockbox_alert_events_v3_watchlist_created_idx
  on public.stockbox_alert_events_v3 (watchlist_id, created_at desc)
  where watchlist_id is not null;

alter table public.stockbox_alert_events_v3 enable row level security;

drop policy if exists "stockbox alert events v3 select own" on public.stockbox_alert_events_v3;
create policy "stockbox alert events v3 select own" on public.stockbox_alert_events_v3
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Alert facts are derived by trusted StockBox server/background code. A client
-- may read its own facts but cannot forge recommendation or data-quality events.
revoke insert, update, delete on table public.stockbox_alert_events_v3 from public, anon, authenticated;

commit;
