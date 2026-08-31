begin;

alter table public.notifications
  add column if not exists event_key text;

create unique index if not exists notifications_event_key_unique_idx
  on public.notifications (event_key)
  where event_key is not null;

commit;
