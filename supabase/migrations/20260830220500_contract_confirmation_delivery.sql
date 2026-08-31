begin;

create table if not exists public.contract_confirmation_deliveries (
  stripe_invoice_id text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  stripe_subscription_id text,
  status text not null default 'pending',
  attempts integer not null default 1,
  reserved_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_confirmation_delivery_status_check
    check (status in ('pending', 'sent', 'failed')),
  constraint contract_confirmation_delivery_attempts_check
    check (attempts >= 1)
);

alter table public.contract_confirmation_deliveries enable row level security;
revoke all on public.contract_confirmation_deliveries from anon, authenticated;

create index if not exists contract_confirmation_deliveries_user_id_idx
  on public.contract_confirmation_deliveries(user_id);
create index if not exists contract_confirmation_deliveries_subscription_idx
  on public.contract_confirmation_deliveries(stripe_subscription_id);

create or replace function public.reserve_contract_confirmation(
  p_stripe_invoice_id text,
  p_user_id uuid,
  p_stripe_subscription_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id text;
begin
  if trim(coalesce(p_stripe_invoice_id, '')) = '' then
    raise exception 'stripe invoice id required';
  end if;

  insert into public.contract_confirmation_deliveries (
    stripe_invoice_id, user_id, stripe_subscription_id
  ) values (
    p_stripe_invoice_id, p_user_id, p_stripe_subscription_id
  )
  on conflict (stripe_invoice_id) do update
  set status = 'pending',
      user_id = excluded.user_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      attempts = public.contract_confirmation_deliveries.attempts + 1,
      reserved_at = now(),
      updated_at = now()
  where public.contract_confirmation_deliveries.status = 'failed'
     or (
       public.contract_confirmation_deliveries.status = 'pending'
       and public.contract_confirmation_deliveries.reserved_at < now() - interval '10 minutes'
     )
  returning stripe_invoice_id into v_invoice_id;

  return v_invoice_id is not null;
end;
$$;

create or replace function public.mark_contract_confirmation_sent(
  p_stripe_invoice_id text,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id text;
begin
  update public.contract_confirmation_deliveries
  set status = 'sent',
      sent_at = now(),
      provider_message_id = nullif(trim(p_provider_message_id), ''),
      updated_at = now()
  where stripe_invoice_id = p_stripe_invoice_id
    and status = 'pending'
  returning stripe_invoice_id into v_invoice_id;

  return v_invoice_id is not null;
end;
$$;

create or replace function public.mark_contract_confirmation_failed(p_stripe_invoice_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id text;
begin
  update public.contract_confirmation_deliveries
  set status = 'failed', updated_at = now()
  where stripe_invoice_id = p_stripe_invoice_id
    and status = 'pending'
  returning stripe_invoice_id into v_invoice_id;

  return v_invoice_id is not null;
end;
$$;

revoke all on function public.reserve_contract_confirmation(text, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_contract_confirmation_sent(text, text) from public, anon, authenticated;
revoke all on function public.mark_contract_confirmation_failed(text) from public, anon, authenticated;
grant execute on function public.reserve_contract_confirmation(text, uuid, text) to service_role;
grant execute on function public.mark_contract_confirmation_sent(text, text) to service_role;
grant execute on function public.mark_contract_confirmation_failed(text) to service_role;

commit;
