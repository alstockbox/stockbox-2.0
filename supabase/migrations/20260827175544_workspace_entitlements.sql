begin;

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
begin
  select coalesce(role, 'customer') into v_role
  from public.profiles
  where id = p_user_id;

  if v_role = 'admin' then
    select entitlements into v_entitlements
    from public.plans where key = 'elite';
    return jsonb_build_object('plan', 'elite', 'entitlements', coalesce(v_entitlements, '{}'::jsonb));
  end if;

  select plan_key into v_plan_key
  from public.subscriptions
  where user_id = p_user_id
    and status in ('active', 'trialing')
  limit 1;

  v_plan_key := coalesce(v_plan_key, 'free');
  select entitlements into v_entitlements
  from public.plans
  where key = v_plan_key and active = true;

  if v_entitlements is null then
    v_plan_key := 'free';
    select entitlements into v_entitlements
    from public.plans where key = 'free';
  end if;

  return jsonb_build_object(
    'plan', v_plan_key,
    'entitlements', coalesce(v_entitlements, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.workspace_entitlements(uuid)
  from public, anon, authenticated;

create or replace function public.upsert_watchlist_item_with_entitlement(
  p_user_id uuid,
  p_ticker text,
  p_company_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_workspace jsonb;
  v_plan_key text;
  v_limit integer := 0;
  v_count integer := 0;
  v_existing_id uuid;
  v_item_id uuid;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  p_ticker := upper(trim(coalesce(p_ticker, '')));
  p_company_name := trim(coalesce(p_company_name, ''));
  if p_ticker = '' or length(p_ticker) > 16 then raise exception 'Invalid ticker'; end if;
  if p_company_name = '' or length(p_company_name) > 160 then raise exception 'Invalid company name'; end if;

  perform pg_advisory_xact_lock(hashtext('watchlist:' || p_user_id::text));
  v_workspace := private.workspace_entitlements(p_user_id);
  v_plan_key := coalesce(v_workspace->>'plan', 'free');
  v_limit := coalesce((v_workspace->'entitlements'->>'watchlistItems')::integer, 0);

  select id into v_existing_id
  from public.watchlists
  where user_id = p_user_id and ticker = p_ticker
  for update;

  if found then
    update public.watchlists
    set company_name = p_company_name
    where id = v_existing_id;
    return jsonb_build_object('allowed', true, 'reason', 'updated', 'id', v_existing_id, 'plan', v_plan_key, 'limit', v_limit);
  end if;

  select count(*) into v_count
  from public.watchlists
  where user_id = p_user_id;

  if v_limit <= 0 or v_count >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'limit_reached',
      'plan', v_plan_key,
      'used', v_count,
      'limit', v_limit
    );
  end if;

  insert into public.watchlists (user_id, ticker, company_name)
  values (p_user_id, p_ticker, p_company_name)
  returning id into v_item_id;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'created',
    'id', v_item_id,
    'plan', v_plan_key,
    'used', v_count + 1,
    'limit', v_limit
  );
end;
$$;

revoke all on function public.upsert_watchlist_item_with_entitlement(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_watchlist_item_with_entitlement(uuid, text, text)
  to service_role;

create or replace function public.create_portfolio_with_entitlement(
  p_user_id uuid,
  p_name text,
  p_base_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_workspace jsonb;
  v_plan_key text;
  v_limit integer := 0;
  v_count integer := 0;
  v_portfolio_id uuid;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  p_name := trim(coalesce(p_name, ''));
  p_base_currency := upper(trim(coalesce(p_base_currency, '')));
  if p_name = '' or length(p_name) > 80 then raise exception 'Invalid portfolio name'; end if;
  if p_base_currency !~ '^[A-Z]{3}$' then raise exception 'Invalid base currency'; end if;

  perform pg_advisory_xact_lock(hashtext('portfolio:' || p_user_id::text));
  v_workspace := private.workspace_entitlements(p_user_id);
  v_plan_key := coalesce(v_workspace->>'plan', 'free');
  v_limit := coalesce((v_workspace->'entitlements'->>'portfolios')::integer, 0);
  select count(*) into v_count
  from public.portfolios
  where user_id = p_user_id;

  if v_limit <= 0 or v_count >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'limit_reached',
      'plan', v_plan_key,
      'used', v_count,
      'limit', v_limit
    );
  end if;

  insert into public.portfolios (user_id, name, base_currency)
  values (p_user_id, p_name, p_base_currency)
  returning id into v_portfolio_id;

  return jsonb_build_object(
    'allowed', true,
    'reason', 'created',
    'id', v_portfolio_id,
    'plan', v_plan_key,
    'used', v_count + 1,
    'limit', v_limit
  );
end;
$$;

revoke all on function public.create_portfolio_with_entitlement(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_portfolio_with_entitlement(uuid, text, text)
  to service_role;

-- Creation limits must not be bypassable through direct authenticated PostgREST inserts.
revoke insert on public.watchlists, public.portfolios from authenticated;

alter table public.portfolios
  drop constraint if exists portfolios_base_currency_format_check;
alter table public.portfolios
  add constraint portfolios_base_currency_format_check
  check (base_currency ~ '^[A-Z]{3}$') not valid;

alter table public.holdings
  drop constraint if exists holdings_currency_format_check;
alter table public.holdings
  add constraint holdings_currency_format_check
  check (currency ~ '^[A-Z]{3}$') not valid;

commit;
