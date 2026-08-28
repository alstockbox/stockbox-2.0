begin;

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists cancel_at timestamptz,
  add column if not exists launch_offer_redeemed_at timestamptz;

update public.subscriptions
set launch_offer_redeemed_at = coalesce(launch_offer_redeemed_at, created_at)
where plan_key = 'basic'
  and stripe_subscription_id is not null;

drop function if exists public.sync_subscription_from_stripe(
  uuid, text, bigint, text, text, bigint, text, text, text, text, timestamptz
);

alter table public.subscriptions
  add column if not exists stripe_subscription_created bigint,
  add column if not exists last_stripe_event_id text,
  add column if not exists last_stripe_event_created bigint,
  add column if not exists last_stripe_event_type text;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_created bigint not null,
  event_type text not null,
  subscription_id text,
  subscription_created bigint,
  user_id uuid references public.profiles(id) on delete set null,
  outcome text not null default 'processing',
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public, anon, authenticated;

create or replace function public.sync_subscription_from_stripe(
  p_user_id uuid,
  p_event_id text,
  p_event_created bigint,
  p_event_type text,
  p_stripe_subscription_id text,
  p_subscription_created bigint,
  p_stripe_customer_id text,
  p_stripe_price_id text,
  p_plan_key text,
  p_status text,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_cancel_at timestamptz,
  p_launch_offer_redeemed boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.subscriptions%rowtype;
  v_incoming_priority integer;
  v_existing_priority integer;
  v_is_newer_subscription boolean := false;
begin
  if p_event_type not in (
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted'
  ) then
    raise exception 'unsupported Stripe subscription event';
  end if;
  if p_event_id is null or p_event_created is null or p_event_created < 0 then
    raise exception 'invalid Stripe event metadata';
  end if;
  if p_stripe_subscription_id is null or p_subscription_created is null then
    raise exception 'invalid Stripe subscription metadata';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  begin
    insert into public.stripe_webhook_events (
      event_id, event_created, event_type, subscription_id,
      subscription_created, user_id
    ) values (
      p_event_id, p_event_created, p_event_type, p_stripe_subscription_id,
      p_subscription_created, p_user_id
    );
  exception when unique_violation then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end;
  select * into v_existing
  from public.subscriptions
  where user_id = p_user_id
  for update;

  if found and v_existing.stripe_subscription_id is not null
    and v_existing.stripe_subscription_id <> p_stripe_subscription_id
    and v_existing.stripe_subscription_created is not null then
    if p_subscription_created < v_existing.stripe_subscription_created
      or (p_event_type = 'customer.subscription.deleted'
        and p_subscription_created <= v_existing.stripe_subscription_created) then
      update public.stripe_webhook_events
        set outcome = 'stale_subscription'
        where event_id = p_event_id;
      return jsonb_build_object('applied', false, 'reason', 'stale_subscription');
    end if;
    v_is_newer_subscription := p_subscription_created > v_existing.stripe_subscription_created;
  end if;

  if found and not v_is_newer_subscription
    and v_existing.last_stripe_event_created is not null
    and p_event_created < coalesce(v_existing.last_stripe_event_created, -1) then
    update public.stripe_webhook_events
      set outcome = 'stale_event'
      where event_id = p_event_id;
    return jsonb_build_object('applied', false, 'reason', 'stale_event');
  end if;

  v_incoming_priority := case p_event_type
    when 'customer.subscription.deleted' then 3
    when 'customer.subscription.updated' then 2
    else 1
  end;
  v_existing_priority := case v_existing.last_stripe_event_type
    when 'customer.subscription.deleted' then 3
    when 'customer.subscription.updated' then 2
    else 1
  end;
  if found and not v_is_newer_subscription
    and v_existing.last_stripe_event_created is not null
    and p_event_created = v_existing.last_stripe_event_created
    and v_incoming_priority < v_existing_priority then
    update public.stripe_webhook_events
      set outcome = 'stale_event'
      where event_id = p_event_id;
    return jsonb_build_object('applied', false, 'reason', 'stale_event');
  end if;

  insert into public.subscriptions (
    user_id, plan_key, stripe_customer_id, stripe_subscription_id,
    stripe_price_id, status, current_period_end,
    cancel_at_period_end, cancel_at, launch_offer_redeemed_at,
    stripe_subscription_created, last_stripe_event_id,
    last_stripe_event_created, last_stripe_event_type, updated_at
  ) values (
    p_user_id, p_plan_key, p_stripe_customer_id, p_stripe_subscription_id,
    p_stripe_price_id, p_status, p_current_period_end,
    coalesce(p_cancel_at_period_end, false), p_cancel_at,
    case when p_launch_offer_redeemed then to_timestamp(p_event_created) else null end,
    p_subscription_created, p_event_id,
    p_event_created, p_event_type, now()
  )
  on conflict (user_id) do update set
    plan_key = excluded.plan_key,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    cancel_at = excluded.cancel_at,
    launch_offer_redeemed_at = coalesce(public.subscriptions.launch_offer_redeemed_at, excluded.launch_offer_redeemed_at),
    stripe_subscription_created = excluded.stripe_subscription_created,
    last_stripe_event_id = excluded.last_stripe_event_id,
    last_stripe_event_created = excluded.last_stripe_event_created,
    last_stripe_event_type = excluded.last_stripe_event_type,
    updated_at = now();
  update public.stripe_webhook_events
    set outcome = 'applied'
    where event_id = p_event_id;

  return jsonb_build_object('applied', true, 'reason', 'applied');
end;
$$;

revoke all on function public.sync_subscription_from_stripe(
  uuid, text, bigint, text, text, bigint, text, text, text, text, timestamptz, boolean, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.sync_subscription_from_stripe(
  uuid, text, bigint, text, text, bigint, text, text, text, text, timestamptz, boolean, timestamptz, boolean
) to service_role;

commit;
