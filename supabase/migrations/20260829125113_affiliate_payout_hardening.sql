begin;

alter table public.affiliate_commissions
  add column if not exists payout_id uuid references public.affiliate_payouts(id) on delete set null;

create unique index if not exists affiliate_commissions_invoice_unique
  on public.affiliate_commissions(stripe_invoice_id)
  where stripe_invoice_id is not null;

create table public.affiliate_clawbacks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  commission_id uuid not null unique references public.affiliate_commissions(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'sek' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'open' check (status in ('open','processing','settled','canceled')),
  payout_id uuid references public.affiliate_payouts(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index affiliate_clawbacks_affiliate_status_idx
  on public.affiliate_clawbacks(affiliate_id, status);

alter table public.affiliate_clawbacks enable row level security;
create policy "affiliate clawbacks select own" on public.affiliate_clawbacks
  for select to authenticated using (
    affiliate_id in (select id from public.affiliates where user_id = (select auth.uid()))
  );
grant select on public.affiliate_clawbacks to authenticated;
revoke insert, update, delete on public.affiliate_clawbacks from authenticated;

create or replace function public.reverse_affiliate_commission(
  p_payment_intent_id text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission public.affiliate_commissions%rowtype;
  v_previous_status text;
begin
  if nullif(trim(coalesce(p_payment_intent_id, '')), '') is null then return 0; end if;

  select * into v_commission
  from public.affiliate_commissions
  where stripe_payment_intent_id = p_payment_intent_id
    and status <> 'reversed'
  order by created_at desc
  limit 1
  for update;

  if not found then return 0; end if;
  v_previous_status := v_commission.status;

  update public.affiliate_commissions
  set status = 'reversed', reversed_at = now(),
      reversal_reason = left(coalesce(p_reason, 'refund'), 500), updated_at = now()
  where id = v_commission.id;
  if v_previous_status in ('paid', 'payable') then
    insert into public.affiliate_clawbacks (
      affiliate_id, commission_id, amount_cents, currency, reason
    ) values (
      v_commission.affiliate_id, v_commission.id, v_commission.commission_amount_cents,
      v_commission.currency, left(coalesce(p_reason, 'refund'), 500)
    ) on conflict (commission_id) do nothing;
  end if;

  return 1;
end;
$$;

revoke all on function public.reverse_affiliate_commission(text, text)
  from public, anon, authenticated;
grant execute on function public.reverse_affiliate_commission(text, text) to service_role;

create or replace function public.queue_affiliate_payout(
  p_affiliate_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_commission_amount integer := 0;
  v_clawback_amount integer := 0;
  v_net_amount integer := 0;
  v_payout_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('affiliate-payout:' || p_affiliate_id::text));

  select * into v_affiliate
  from public.affiliates
  where id = p_affiliate_id
    and status = 'active'
    and payout_enabled = true
    and stripe_connect_account_id is not null
  for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_enabled'); end if;

  select coalesce(sum(commission_amount_cents), 0)::integer into v_commission_amount
  from public.affiliate_commissions
  where affiliate_id = p_affiliate_id
    and status = 'approved'
    and payout_id is null
    and available_at <= now();

  select coalesce(sum(amount_cents), 0)::integer into v_clawback_amount
  from public.affiliate_clawbacks
  where affiliate_id = p_affiliate_id
    and status = 'open'
    and payout_id is null;

  v_net_amount := v_commission_amount - v_clawback_amount;
  if v_net_amount < v_affiliate.payout_minimum_cents then
    return jsonb_build_object(
      'ok', false, 'reason', 'below_minimum',
      'commissionCents', v_commission_amount,
      'clawbackCents', v_clawback_amount,
      'amountCents', greatest(v_net_amount, 0)
    );
  end if;
  insert into public.affiliate_payouts (
    affiliate_id, amount_cents, currency, status, idempotency_key, period_end
  ) values (
    p_affiliate_id, v_net_amount, 'sek', 'processing', p_idempotency_key, now()
  ) on conflict (idempotency_key) do nothing
  returning id into v_payout_id;

  if v_payout_id is null then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  update public.affiliate_commissions
  set status = 'payable', payout_id = v_payout_id, updated_at = now()
  where affiliate_id = p_affiliate_id
    and status = 'approved'
    and payout_id is null
    and available_at <= now();

  update public.affiliate_clawbacks
  set status = 'processing', payout_id = v_payout_id
  where affiliate_id = p_affiliate_id
    and status = 'open'
    and payout_id is null;

  return jsonb_build_object(
    'ok', true, 'payoutId', v_payout_id,
    'amountCents', v_net_amount,
    'commissionCents', v_commission_amount,
    'clawbackCents', v_clawback_amount,
    'connectAccountId', v_affiliate.stripe_connect_account_id
  );
end;
$$;
revoke all on function public.queue_affiliate_payout(uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_affiliate_payout(uuid, text) to service_role;

create or replace function public.complete_affiliate_payout(
  p_payout_id uuid,
  p_stripe_transfer_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.affiliate_payouts
  set status = 'paid', stripe_transfer_id = p_stripe_transfer_id,
      processed_at = now(), paid_at = now()
  where id = p_payout_id and status = 'processing';

  update public.affiliate_commissions
  set status = 'paid', paid_at = now(), updated_at = now()
  where payout_id = p_payout_id and status = 'payable';

  update public.affiliate_commissions
  set paid_at = coalesce(paid_at, now()), updated_at = now()
  where payout_id = p_payout_id and status = 'reversed';

  update public.affiliate_clawbacks
  set status = 'settled', settled_at = now()
  where payout_id = p_payout_id and status = 'processing';
end;
$$;
revoke all on function public.complete_affiliate_payout(uuid, text)
  from public, anon, authenticated;
grant execute on function public.complete_affiliate_payout(uuid, text) to service_role;

create or replace function public.fail_affiliate_payout(
  p_payout_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.affiliate_payouts
  set status = 'failed', failure_reason = left(coalesce(p_reason, 'transfer_failed'), 500),
      processed_at = now()
  where id = p_payout_id and status = 'processing';

  update public.affiliate_clawbacks c
  set status = 'canceled', settled_at = now()
  where c.status = 'open'
    and c.commission_id in (
      select id from public.affiliate_commissions
      where payout_id = p_payout_id and status = 'reversed'
    );

  update public.affiliate_commissions
  set status = 'approved', payout_id = null, updated_at = now()
  where payout_id = p_payout_id and status = 'payable';

  update public.affiliate_commissions
  set payout_id = null, updated_at = now()
  where payout_id = p_payout_id and status = 'reversed';

  update public.affiliate_clawbacks
  set status = 'open', payout_id = null
  where payout_id = p_payout_id and status = 'processing';
end;
$$;

revoke all on function public.fail_affiliate_payout(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_affiliate_payout(uuid, text) to service_role;

commit;
