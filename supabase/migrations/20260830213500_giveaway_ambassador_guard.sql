begin;

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
    select 1
    from public.affiliates a
    join public.profiles p on p.id = a.user_id
    where a.id = p_affiliate_id
      and a.status = 'active'
      and p.role = 'affiliate_ambassador'
  ) then
    raise exception 'active affiliate ambassador required';
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

commit;
