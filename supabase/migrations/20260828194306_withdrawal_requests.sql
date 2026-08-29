begin;

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stripe_subscription_id text not null,
  plan_key text not null,
  subscription_status_snapshot text not null,
  submitted_at timestamptz not null default now(),
  status text not null default 'received'
    check (status in ('received', 'processing', 'completed', 'declined')),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists withdrawal_requests_user_submitted_idx
  on public.withdrawal_requests (user_id, submitted_at desc);

alter table public.withdrawal_requests enable row level security;

create policy "withdrawal_requests_select_own"
  on public.withdrawal_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.withdrawal_requests from anon;
revoke insert, update, delete on public.withdrawal_requests from authenticated;

grant select on public.withdrawal_requests to authenticated;

commit;