begin;

alter table public.subscriptions
  add column if not exists launch_offer_redeemed_plans text[] not null default '{}';

update public.subscriptions
set launch_offer_redeemed_plans = array_append(launch_offer_redeemed_plans, 'basic')
where launch_offer_redeemed_at is not null
  and not ('basic' = any(launch_offer_redeemed_plans));

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'affiliate_giveaway_campaigns' and column_name = 'duration_days'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'affiliate_giveaway_campaigns' and column_name = 'duration_months'
  ) then
    alter table public.affiliate_giveaway_campaigns rename column duration_days to duration_months;
  end if;
end;
$$;

alter table public.affiliate_giveaway_campaigns alter column claim_expires_at drop not null;
alter table public.affiliate_giveaway_campaigns drop constraint if exists affiliate_giveaway_campaigns_duration_days_check;
alter table public.affiliate_giveaway_campaigns drop constraint if exists affiliate_giveaway_campaigns_duration_months_check;
alter table public.affiliate_giveaway_campaigns
  add constraint affiliate_giveaway_campaigns_duration_months_check
  check (duration_months between 1 and 24);

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
    launch_offer_redeemed_plans, stripe_subscription_created, last_stripe_event_id,
    last_stripe_event_created, last_stripe_event_type, updated_at
  ) values (
    p_user_id, p_plan_key, p_stripe_customer_id, p_stripe_subscription_id,
    p_stripe_price_id, p_status, p_current_period_end,
    coalesce(p_cancel_at_period_end, false), p_cancel_at,
    case when p_launch_offer_redeemed then to_timestamp(p_event_created) else null end,
    case when p_launch_offer_redeemed and p_plan_key in ('basic','standard','premium')
      then array[p_plan_key]::text[] else '{}'::text[] end,
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
    launch_offer_redeemed_plans = case
      when p_launch_offer_redeemed
        and p_plan_key in ('basic','standard','premium')
        and not (p_plan_key = any(public.subscriptions.launch_offer_redeemed_plans))
      then array_append(public.subscriptions.launch_offer_redeemed_plans, p_plan_key)
      else public.subscriptions.launch_offer_redeemed_plans
    end,
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

drop function if exists public.create_affiliate_giveaway_campaign(uuid, uuid, text, text, integer, timestamptz, text[]);

create or replace function public.create_affiliate_giveaway_campaign(
  p_actor_id uuid,
  p_affiliate_id uuid,
  p_label text,
  p_plan_key text,
  p_duration_months integer,
  p_claim_expires_at timestamptz,
  p_codes text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_actor_role text;
  v_campaign_id uuid;
  v_quantity integer := coalesce(array_length(p_codes, 1), 0);
  v_distinct_quantity integer;
begin  select role into v_actor_role from public.profiles where id = p_actor_id;
  if coalesce(v_actor_role, '') <> 'admin' then
    raise exception 'admin role required';
  end if;
  if not exists (
    select 1 from public.affiliates
    where id = p_affiliate_id and status = 'active'
  ) then
    raise exception 'active affiliate required';
  end if;
  if p_plan_key not in ('basic','standard','premium','elite') then
    raise exception 'paid giveaway plan required';
  end if;
  if v_quantity not between 1 and 100
     or p_duration_months not between 1 and 24
     or (p_claim_expires_at is not null and p_claim_expires_at <= now()) then
    raise exception 'invalid giveaway campaign bounds';
  end if;

  select count(distinct upper(trim(code))) into v_distinct_quantity
  from unnest(p_codes) as codes(code);
  if v_distinct_quantity <> v_quantity
     or exists (
       select 1 from unnest(p_codes) as codes(code)
       where upper(trim(code)) !~ '^[A-Z0-9-]{6,64}$'
     ) then
    raise exception 'invalid or duplicate giveaway codes';
  end if;

  insert into public.affiliate_giveaway_campaigns (
    affiliate_id, created_by, label, plan_key, quantity,
    duration_months, claim_expires_at
  ) values (
    p_affiliate_id, p_actor_id, trim(p_label), p_plan_key, v_quantity,
    p_duration_months, p_claim_expires_at
  ) returning id into v_campaign_id;

  insert into public.affiliate_giveaway_codes (campaign_id, code)
  select v_campaign_id, upper(trim(code)) from unnest(p_codes) as codes(code);

  return jsonb_build_object('ok', true, 'campaignId', v_campaign_id, 'quantity', v_quantity);
end;
$$;
revoke all on function public.create_affiliate_giveaway_campaign(
  uuid, uuid, text, text, integer, timestamptz, text[]
) from public, anon, authenticated;
grant execute on function public.create_affiliate_giveaway_campaign(
  uuid, uuid, text, text, integer, timestamptz, text[]
) to service_role;

create or replace function public.redeem_affiliate_giveaway_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code public.affiliate_giveaway_codes%rowtype;
  v_campaign public.affiliate_giveaway_campaigns%rowtype;
  v_grant_id uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'authentication required'; end if;

  select gc.* into v_code
  from public.affiliate_giveaway_codes gc
  where gc.code = upper(trim(p_code))
  for update;
  if not found then raise exception 'invalid giveaway code'; end if;

  select * into v_campaign
  from public.affiliate_giveaway_campaigns
  where id = v_code.campaign_id;

  if v_code.status <> 'available'
     or v_campaign.status <> 'active'
     or (v_campaign.claim_expires_at is not null and v_campaign.claim_expires_at <= v_now) then
    raise exception 'giveaway code is unavailable';
  end if;

  update public.affiliate_giveaway_codes
  set status = 'redeemed', redeemed_by = v_user_id, redeemed_at = v_now
  where id = v_code.id and status = 'available';
  if not found then raise exception 'giveaway code already used'; end if;

  insert into public.promotional_access_grants (
    user_id, campaign_id, code_id, plan_key, starts_at, ends_at
  ) values (
    v_user_id, v_campaign.id, v_code.id, v_campaign.plan_key,
    v_now, v_now + make_interval(months => v_campaign.duration_months)
  ) returning id into v_grant_id;

  return jsonb_build_object(
    'ok', true, 'grantId', v_grant_id, 'plan', v_campaign.plan_key,
    'startsAt', v_now,
    'endsAt', v_now + make_interval(months => v_campaign.duration_months)
  );
end;
$$;

revoke all on function public.redeem_affiliate_giveaway_code(text)
  from public, anon, authenticated;
grant execute on function public.redeem_affiliate_giveaway_code(text) to authenticated;

create or replace function public.reserve_analysis_entitlement(
  p_user_id uuid,
  p_analysis_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_period_start timestamptz := date_trunc('month', now());
  v_profile_created_at timestamptz;
  v_plan_key text := 'free';
  v_role text := 'customer';
  v_entitlements jsonb;
  v_ambassador public.ambassador_entitlements%rowtype;
  v_monthly_limit integer := 0;
  v_deep_limit integer := 0;
  v_used_total integer := 0;
  v_used_deep integer := 0;
  v_reserved_total integer := 0;
  v_reserved_deep integer := 0;
  v_total_usage integer := 0;
  v_deep_usage integer := 0;
  v_uses_deep_quota boolean := p_analysis_type in ('deep', 'research');
  v_reservation_id uuid;
begin
  if p_analysis_type not in ('summary', 'numbers', 'deep', 'research') then
    raise exception 'unsupported analysis type';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  select coalesce(role, 'customer'), created_at
  into v_role, v_profile_created_at
  from public.profiles
  where id = p_user_id;
  if not found then raise exception 'profile not found'; end if;

  if v_role = 'admin' then
    v_plan_key := 'elite';
    v_monthly_limit := 2147483647;
    v_deep_limit := 2147483647;
  elsif v_role = 'affiliate_ambassador' then
    v_plan_key := 'affiliate_ambassador';
    select * into v_ambassador
    from public.ambassador_entitlements
    where user_id = p_user_id;
    v_monthly_limit := coalesce(v_ambassador.monthly_analyses, 100);
    v_deep_limit := coalesce(v_ambassador.deep_analyses, 100);
  else
    v_plan_key := private.stockbox_effective_plan(p_user_id);
    select entitlements into v_entitlements
    from public.plans where key = v_plan_key and active = true;
    if v_entitlements is null then
      v_plan_key := 'free';
      select entitlements into v_entitlements from public.plans where key = 'free';
    end if;
    v_monthly_limit := coalesce((v_entitlements->>'monthlyAnalyses')::integer, 0);
    v_deep_limit := coalesce((v_entitlements->>'deepAnalyses')::integer, 0);

    if v_plan_key = 'free' then
      if now() < v_profile_created_at + interval '30 days' then
        v_period_start := v_profile_created_at;
        v_monthly_limit := 5;
      else
        v_period_start := date_trunc('month', now());
      end if;
    end if;
  end if;
  select count(*) into v_used_total
  from public.analyses
  where user_id = p_user_id and created_at >= v_period_start;

  select count(*) into v_used_deep
  from public.analyses
  where user_id = p_user_id
    and analysis_type in ('deep', 'research')
    and created_at >= v_period_start;

  select count(*) into v_reserved_total
  from public.analysis_quota_reservations
  where user_id = p_user_id
    and period_start = v_period_start
    and status = 'reserved';

  select count(*) into v_reserved_deep
  from public.analysis_quota_reservations
  where user_id = p_user_id
    and analysis_type in ('deep', 'research')
    and period_start = v_period_start
    and status = 'reserved';

  v_total_usage := v_used_total + v_reserved_total;
  v_deep_usage := v_used_deep + v_reserved_deep;

  if v_total_usage >= v_monthly_limit
     or (v_uses_deep_quota and v_deep_usage >= v_deep_limit) then
    return jsonb_build_object(
      'allowed', false, 'configured', true, 'plan', v_plan_key,
      'reservationId', null,
      'usage', jsonb_build_object('analyses', v_total_usage, 'deepAnalyses', v_deep_usage),
      'limits', jsonb_build_object('analyses', v_monthly_limit, 'deepAnalyses', v_deep_limit)
    );
  end if;
  insert into public.analysis_quota_reservations (
    user_id, analysis_type, period_start
  ) values (
    p_user_id, p_analysis_type, v_period_start
  ) returning id into v_reservation_id;

  return jsonb_build_object(
    'allowed', true, 'configured', true, 'plan', v_plan_key,
    'reservationId', v_reservation_id,
    'usage', jsonb_build_object('analyses', v_total_usage, 'deepAnalyses', v_deep_usage),
    'limits', jsonb_build_object('analyses', v_monthly_limit, 'deepAnalyses', v_deep_limit)
  );
end;
$$;

revoke all on function public.reserve_analysis_entitlement(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_analysis_entitlement(uuid, text)
  to service_role;

create or replace function private.workspace_entitlements(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_role text := 'customer';
  v_plan_key text := 'free';
  v_entitlements jsonb;
  v_ambassador public.ambassador_entitlements%rowtype;
begin  select coalesce(role, 'customer') into v_role
  from public.profiles where id = p_user_id;

  if v_role = 'admin' then
    select entitlements into v_entitlements from public.plans where key = 'elite';
    v_entitlements := jsonb_set(
      jsonb_set(coalesce(v_entitlements, '{}'::jsonb), '{monthlyAnalyses}', '2147483647'::jsonb),
      '{deepAnalyses}', '2147483647'::jsonb
    );
    return jsonb_build_object('plan', 'elite', 'entitlements', v_entitlements);
  end if;

  if v_role = 'affiliate_ambassador' then
    select * into v_ambassador
    from public.ambassador_entitlements where user_id = p_user_id;
    return jsonb_build_object(
      'plan', 'affiliate_ambassador',
      'entitlements', jsonb_build_object(
        'monthlyAnalyses', coalesce(v_ambassador.monthly_analyses, 100),
        'deepAnalyses', coalesce(v_ambassador.deep_analyses, 100),
        'watchlistItems', coalesce(v_ambassador.watchlist_items, 75),
        'batchRows', coalesce(v_ambassador.batch_rows, 50),
        'portfolios', coalesce(v_ambassador.portfolios, 5),
        'aiAssistant', false,
        'hourlyAlerts', false
      )
    );
  end if;

  v_plan_key := private.stockbox_effective_plan(p_user_id);
  select entitlements into v_entitlements
  from public.plans where key = v_plan_key and active = true;

  if v_entitlements is null then
    v_plan_key := 'free';
    select entitlements into v_entitlements from public.plans where key = 'free';
  end if;

  return jsonb_build_object(
    'plan', v_plan_key,
    'entitlements', coalesce(v_entitlements, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.workspace_entitlements(uuid)
  from public, anon, authenticated;

commit;
