begin;

alter table public.withdrawal_requests
  alter column user_id drop not null,
  alter column stripe_subscription_id drop not null,
  alter column subscription_status_snapshot drop not null;

alter table public.withdrawal_requests
  drop constraint if exists withdrawal_requests_user_id_fkey;

alter table public.withdrawal_requests
  add constraint withdrawal_requests_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.withdrawal_requests
  add column if not exists consumer_name text,
  add column if not exists account_email text,
  add column if not exists confirmation_email text,
  add column if not exists contract_reference text,
  add column if not exists receipt_token_hash text,
  add column if not exists receipt_delivery_status text not null default 'pending',
  add column if not exists receipt_delivered_at timestamptz;
alter table public.withdrawal_requests
  drop constraint if exists withdrawal_requests_receipt_delivery_status_check;

alter table public.withdrawal_requests
  add constraint withdrawal_requests_receipt_delivery_status_check
  check (receipt_delivery_status in ('pending', 'sent', 'failed'));

create unique index if not exists withdrawal_requests_receipt_token_hash_idx
  on public.withdrawal_requests (receipt_token_hash)
  where receipt_token_hash is not null;

revoke all on public.withdrawal_requests from anon;
revoke insert, update, delete on public.withdrawal_requests from authenticated;
grant select on public.withdrawal_requests to authenticated;

commit;
