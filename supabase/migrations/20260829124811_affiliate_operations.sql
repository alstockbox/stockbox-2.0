begin;

alter table public.affiliates
  add column if not exists display_name text,
  add column if not exists monthly_analysis_limit integer not null default 100,
  add column if not exists payout_hold_days integer not null default 30,
  add column if not exists payout_minimum_cents integer not null default 10000,
  add column if not exists stripe_connect_account_id text,
  add column if not exists payout_enabled boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.affiliates drop constraint if exists affiliates_monthly_analysis_limit_check;
alter table public.affiliates add constraint affiliates_monthly_analysis_limit_check
  check (monthly_analysis_limit between 0 and 100000);
alter table public.affiliates drop constraint if exists affiliates_commission_basis_points_check;
alter table public.affiliates add constraint affiliates_commission_basis_points_check
  check (commission_basis_points between 0 and 10000);
alter table public.affiliates drop constraint if exists affiliates_payout_hold_days_check;
alter table public.affiliates add constraint affiliates_payout_hold_days_check
  check (payout_hold_days between 0 and 180);
alter table public.affiliates drop constraint if exists affiliates_payout_minimum_cents_check;
alter table public.affiliates add constraint affiliates_payout_minimum_cents_check
  check (payout_minimum_cents >= 0);

alter table public.referrals drop constraint if exists referrals_code_key;
alter table public.referrals add column if not exists affiliate_id uuid references public.affiliates(id) on delete set null;
alter table public.referrals add column if not exists attributed_at timestamptz not null default now();
alter table public.referrals add column if not exists converted_at timestamptz;
update public.referrals r
set affiliate_id = a.id
from public.affiliates a
where r.affiliate_id is null and a.user_id = r.referrer_id;

create index if not exists referrals_code_idx on public.referrals(code);
create unique index if not exists referrals_referred_user_unique
  on public.referrals(referred_id) where referred_id is not null;

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  referred_user_id uuid references public.profiles(id) on delete set null,
  source_event_id text not null unique,
  stripe_invoice_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  commission_basis_points integer not null check (commission_basis_points between 0 and 10000),
  commission_amount_cents integer not null check (commission_amount_cents >= 0),
  currency text not null default 'sek' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'pending' check (status in ('pending','approved','payable','paid','reversed')),
  available_at timestamptz not null,
  paid_at timestamptz,
  reversed_at timestamptz,
  reversal_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists affiliate_commissions_affiliate_status_idx
  on public.affiliate_commissions(affiliate_id, status, available_at);
create index if not exists affiliate_commissions_payment_intent_idx
  on public.affiliate_commissions(stripe_payment_intent_id);

create table public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'sek' check (currency ~ '^[a-z]{3}$'),
  status text not null default 'queued' check (status in ('queued','processing','paid','failed','canceled')),
  idempotency_key text not null unique,
  stripe_transfer_id text,
  period_start timestamptz,
  period_end timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  paid_at timestamptz
);

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 1 and 4000),
  status text not null default 'new' check (status in ('new','reviewed','resolved')),
  testimonial_approved boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 320),
  subject text not null check (char_length(subject) between 1 and 160),
  message text not null check (char_length(message) between 1 and 6000),
  status text not null default 'new' check (status in ('new','in_progress','resolved','spam')),
  created_at timestamptz not null default now()
);

alter table public.affiliate_commissions enable row level security;
alter table public.affiliate_payouts enable row level security;
alter table public.feedback_submissions enable row level security;
alter table public.contact_messages enable row level security;

create policy "affiliate commissions select own" on public.affiliate_commissions
  for select to authenticated using (
    affiliate_id in (select id from public.affiliates where user_id = (select auth.uid()))
  );
create policy "affiliate payouts select own" on public.affiliate_payouts
  for select to authenticated using (
    affiliate_id in (select id from public.affiliates where user_id = (select auth.uid()))
  );

grant select on public.affiliate_commissions, public.affiliate_payouts to authenticated;
revoke insert, update, delete on public.affiliate_commissions, public.affiliate_payouts from authenticated;
revoke all on public.feedback_submissions, public.contact_messages from anon, authenticated;
create or replace function public.record_affiliate_referral(p_referred_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_affiliate public.affiliates%rowtype;
begin
  if p_referred_id is null or v_code !~ '^[A-Z0-9_-]{3,48}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into v_affiliate from public.affiliates
  where upper(code) = v_code and status = 'active'
  limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_affiliate.user_id = p_referred_id then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  insert into public.referrals (referrer_id, referred_id, code, status, affiliate_id, attributed_at)
  values (v_affiliate.user_id, p_referred_id, v_affiliate.code, 'attributed', v_affiliate.id, now())
  on conflict (referred_id) where referred_id is not null do nothing;

  return jsonb_build_object('ok', true, 'affiliateId', v_affiliate.id, 'code', v_affiliate.code);
end;
$$;

revoke all on function public.record_affiliate_referral(uuid, text) from public, anon, authenticated;
grant execute on function public.record_affiliate_referral(uuid, text) to service_role;
create or replace function public.record_affiliate_commission(
  p_referred_user_id uuid,
  p_source_event_id text,
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_stripe_payment_intent_id text,
  p_gross_amount_cents integer,
  p_currency text,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_commission integer;
  v_id uuid;
begin
  if p_gross_amount_cents <= 0 then return jsonb_build_object('ok', false, 'reason', 'zero_amount'); end if;
  select a.* into v_affiliate
  from public.referrals r join public.affiliates a on a.id = r.affiliate_id
  where r.referred_id = p_referred_user_id and a.status = 'active'
  limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_affiliate'); end if;

  v_commission := floor((p_gross_amount_cents::numeric * v_affiliate.commission_basis_points) / 10000)::integer;
  if v_commission <= 0 then return jsonb_build_object('ok', false, 'reason', 'zero_commission'); end if;
  insert into public.affiliate_commissions (
    affiliate_id, referred_user_id, source_event_id, stripe_invoice_id,
    stripe_subscription_id, stripe_payment_intent_id, gross_amount_cents,
    commission_basis_points, commission_amount_cents, currency, status, available_at
  ) values (
    v_affiliate.id, p_referred_user_id, p_source_event_id, p_stripe_invoice_id,
    p_stripe_subscription_id, p_stripe_payment_intent_id, p_gross_amount_cents,
    v_affiliate.commission_basis_points, v_commission, lower(p_currency), 'approved',
    coalesce(p_paid_at, now()) + make_interval(days => v_affiliate.payout_hold_days)
  ) on conflict (source_event_id) do nothing returning id into v_id;

  update public.referrals
  set status = 'converted', converted_at = coalesce(converted_at, now())
  where referred_id = p_referred_user_id;

  if v_id is null then return jsonb_build_object('ok', true, 'reason', 'duplicate'); end if;
  return jsonb_build_object(
    'ok', true,
    'reason', 'created',
    'commissionId', v_id,
    'affiliateId', v_affiliate.id,
    'amountCents', v_commission
  );
end;
$$;

revoke all on function public.record_affiliate_commission(uuid, text, text, text, text, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_affiliate_commission(uuid, text, text, text, text, integer, text, timestamptz)
  to service_role;
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
  v_count integer;
begin
  update public.affiliate_commissions
  set status = 'reversed',
      reversed_at = now(),
      reversal_reason = left(coalesce(p_reason, 'refund'), 500),
      updated_at = now()
  where stripe_payment_intent_id = p_payment_intent_id
    and status in ('pending','approved','payable');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reverse_affiliate_commission(text, text) from public, anon, authenticated;
grant execute on function public.reverse_affiliate_commission(text, text) to service_role;

create or replace function public.reserve_affiliate_payout(p_affiliate_id uuid, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate public.affiliates%rowtype;
  v_amount integer := 0;
  v_payout_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('affiliate-payout:' || p_affiliate_id::text));
  select * into v_affiliate from public.affiliates
  where id = p_affiliate_id and status = 'active' and payout_enabled = true
  for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_enabled'); end if;

  select coalesce(sum(commission_amount_cents), 0)::integer into v_amount
  from public.affiliate_commissions
  where affiliate_id = p_affiliate_id
    and status = 'approved'
    and available_at <= now();

  if v_amount < v_affiliate.payout_minimum_cents then
    return jsonb_build_object('ok', false, 'reason', 'below_minimum', 'amountCents', v_amount);
  end if;

  insert into public.affiliate_payouts (
    affiliate_id, amount_cents, currency, status, idempotency_key, period_end
  ) values (
    p_affiliate_id, v_amount, 'sek', 'processing', p_idempotency_key, now()
  ) on conflict (idempotency_key) do nothing returning id into v_payout_id;

  if v_payout_id is null then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  update public.affiliate_commissions
  set status = 'payable', updated_at = now(), metadata = metadata || jsonb_build_object('payoutId', v_payout_id)
  where affiliate_id = p_affiliate_id and status = 'approved' and available_at <= now();
  return jsonb_build_object(
    'ok', true,
    'payoutId', v_payout_id,
    'amountCents', v_amount,
    'connectAccountId', v_affiliate.stripe_connect_account_id
  );
end;
$$;

revoke all on function public.reserve_affiliate_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_affiliate_payout(uuid, text) to service_role;

create or replace function public.complete_affiliate_payout(p_payout_id uuid, p_stripe_transfer_id text)
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
  where metadata->>'payoutId' = p_payout_id::text and status = 'payable';
end;
$$;

revoke all on function public.complete_affiliate_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_affiliate_payout(uuid, text) to service_role;
create or replace function public.fail_affiliate_payout(p_payout_id uuid, p_reason text)
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

  update public.affiliate_commissions
  set status = 'approved', updated_at = now(), metadata = metadata - 'payoutId'
  where metadata->>'payoutId' = p_payout_id::text and status = 'payable';
end;
$$;

revoke all on function public.fail_affiliate_payout(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_affiliate_payout(uuid, text) to service_role;

commit;