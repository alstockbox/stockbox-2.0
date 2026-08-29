begin;

alter table public.affiliate_commissions
  add column if not exists commissionable_amount_cents integer;

update public.affiliate_commissions
set commissionable_amount_cents = gross_amount_cents
where commissionable_amount_cents is null;

alter table public.affiliate_commissions
  alter column commissionable_amount_cents set not null;

alter table public.affiliate_commissions
  drop constraint if exists affiliate_commissions_commissionable_amount_check;
alter table public.affiliate_commissions
  add constraint affiliate_commissions_commissionable_amount_check
  check (commissionable_amount_cents >= 0 and commissionable_amount_cents <= gross_amount_cents);

create or replace function public.record_affiliate_commission(
  p_referred_user_id uuid,
  p_source_event_id text,
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_stripe_payment_intent_id text,
  p_gross_amount_cents integer,
  p_commissionable_amount_cents integer,
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
  if p_gross_amount_cents <= 0 or p_commissionable_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'zero_amount');
  end if;
  if p_commissionable_amount_cents > p_gross_amount_cents then
    return jsonb_build_object('ok', false, 'reason', 'invalid_commission_base');
  end if;

  select a.* into v_affiliate
  from public.referrals r join public.affiliates a on a.id = r.affiliate_id
  where r.referred_id = p_referred_user_id and a.status = 'active'
  limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_affiliate'); end if;

  v_commission := floor((p_commissionable_amount_cents::numeric * v_affiliate.commission_basis_points) / 10000)::integer;
  if v_commission <= 0 then return jsonb_build_object('ok', false, 'reason', 'zero_commission'); end if;

  insert into public.affiliate_commissions (
    affiliate_id, referred_user_id, source_event_id, stripe_invoice_id,
    stripe_subscription_id, stripe_payment_intent_id, gross_amount_cents,
    commissionable_amount_cents, commission_basis_points, commission_amount_cents,
    currency, status, available_at
  ) values (
    v_affiliate.id, p_referred_user_id, p_source_event_id, p_stripe_invoice_id,
    p_stripe_subscription_id, p_stripe_payment_intent_id, p_gross_amount_cents,
    p_commissionable_amount_cents, v_affiliate.commission_basis_points, v_commission,
    lower(p_currency), 'approved',
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
    'grossAmountCents', p_gross_amount_cents,
    'commissionableAmountCents', p_commissionable_amount_cents,
    'amountCents', v_commission
  );
end;
$$;

revoke all on function public.record_affiliate_commission(uuid, text, text, text, text, integer, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_affiliate_commission(uuid, text, text, text, text, integer, integer, text, timestamptz)
  to service_role;
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
begin
  raise exception 'commissionable_amount_required';
end;
$$;

revoke all on function public.record_affiliate_commission(uuid, text, text, text, text, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_affiliate_commission(uuid, text, text, text, text, integer, text, timestamptz)
  to service_role;

commit;
