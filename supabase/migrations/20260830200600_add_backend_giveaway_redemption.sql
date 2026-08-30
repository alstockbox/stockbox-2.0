create or replace function public.redeem_affiliate_giveaway_code(
  p_code text,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.affiliate_giveaway_codes%rowtype;
  v_campaign public.affiliate_giveaway_campaigns%rowtype;
  v_grant_id uuid;
  v_now timestamptz := now();
begin
  if p_user_id is null then
    raise exception 'authenticated user required';
  end if;

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
  set status = 'redeemed', redeemed_by = p_user_id, redeemed_at = v_now
  where id = v_code.id and status = 'available';
  if not found then raise exception 'giveaway code already used'; end if;

  insert into public.promotional_access_grants (
    user_id, campaign_id, code_id, plan_key, starts_at, ends_at
  ) values (
    p_user_id, v_campaign.id, v_code.id, v_campaign.plan_key,
    v_now, v_now + make_interval(months => v_campaign.duration_months)
  ) returning id into v_grant_id;

  return jsonb_build_object(
    'ok', true, 'grantId', v_grant_id, 'plan', v_campaign.plan_key,
    'startsAt', v_now,
    'endsAt', v_now + make_interval(months => v_campaign.duration_months)
  );
end;
$$;

revoke all on function public.redeem_affiliate_giveaway_code(text, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_affiliate_giveaway_code(text, uuid) to service_role;
