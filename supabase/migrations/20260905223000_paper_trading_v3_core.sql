begin;

create table if not exists public.paper_accounts_v3 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.paper_cash_balances_v3 (
  account_id uuid not null,
  user_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(30,10) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (account_id, currency),
  foreign key (account_id, user_id)
    references public.paper_accounts_v3(id, user_id)
    on delete cascade
);

create table if not exists public.paper_orders_v3 (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  ticker text not null check (char_length(ticker) between 1 and 32 and ticker = upper(ticker)),
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(30,10) not null check (quantity > 0),
  status text not null check (status in ('filled', 'rejected')),
  rejection_reason text check (
    rejection_reason is null or rejection_reason in (
      'INVALID_ORDER',
      'DUPLICATE_IDEMPOTENCY_KEY',
      'LEDGER_INVALID',
      'MARKET_NOT_VERIFIED',
      'MARKET_TICKER_MISMATCH',
      'MARKET_PRICE_INVALID',
      'MARKET_CURRENCY_INVALID',
      'MARKET_TIMESTAMP_INVALID',
      'MARKET_OBSERVATION_FUTURE',
      'MARKET_OBSERVATION_STALE',
      'INSUFFICIENT_CASH',
      'INSUFFICIENT_POSITION'
    )
  ),
  submitted_at timestamptz not null,
  policy_version text not null default 'stockbox-paper-trading-v3.0.0',
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.paper_accounts_v3(id, user_id)
    on delete cascade,
  unique (account_id, idempotency_key),
  check ((status = 'filled' and rejection_reason is null) or (status = 'rejected' and rejection_reason is not null))
);

create table if not exists public.paper_fills_v3 (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  order_id uuid not null unique references public.paper_orders_v3(id) on delete restrict,
  user_id uuid not null,
  ticker text not null check (char_length(ticker) between 1 and 32 and ticker = upper(ticker)),
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(30,10) not null check (quantity > 0),
  price numeric(30,10) not null check (price > 0),
  gross_amount numeric(30,10) generated always as (quantity * price) stored,
  fee numeric(30,10) not null default 0 check (fee = 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  executed_at timestamptz not null,
  market_observed_at timestamptz not null,
  provider text not null check (char_length(provider) between 1 and 120),
  market_verification text not null check (market_verification = 'VERIFIED'),
  pricing_basis text not null check (pricing_basis = 'VERIFIED_OBSERVATION_EXACT'),
  policy_version text not null check (policy_version = 'stockbox-paper-trading-v3.0.0'),
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.paper_accounts_v3(id, user_id)
    on delete cascade,
  check (market_observed_at <= executed_at + interval '30 seconds'),
  check (executed_at - market_observed_at <= interval '20 minutes')
);

create index if not exists paper_accounts_v3_user_created_idx
  on public.paper_accounts_v3 (user_id, created_at desc);
create index if not exists paper_orders_v3_account_created_idx
  on public.paper_orders_v3 (account_id, created_at desc);
create index if not exists paper_fills_v3_account_executed_idx
  on public.paper_fills_v3 (account_id, executed_at desc);
create index if not exists paper_fills_v3_position_idx
  on public.paper_fills_v3 (account_id, ticker, currency, executed_at, id);

alter table public.paper_accounts_v3 enable row level security;
alter table public.paper_cash_balances_v3 enable row level security;
alter table public.paper_orders_v3 enable row level security;
alter table public.paper_fills_v3 enable row level security;

drop policy if exists "paper accounts v3 select own" on public.paper_accounts_v3;
create policy "paper accounts v3 select own" on public.paper_accounts_v3
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "paper cash v3 select own" on public.paper_cash_balances_v3;
create policy "paper cash v3 select own" on public.paper_cash_balances_v3
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "paper orders v3 select own" on public.paper_orders_v3;
create policy "paper orders v3 select own" on public.paper_orders_v3
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "paper fills v3 select own" on public.paper_fills_v3;
create policy "paper fills v3 select own" on public.paper_fills_v3
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.paper_accounts_v3 from public, anon, authenticated;
revoke all on table public.paper_cash_balances_v3 from public, anon, authenticated;
revoke all on table public.paper_orders_v3 from public, anon, authenticated;
revoke all on table public.paper_fills_v3 from public, anon, authenticated;
grant select on table public.paper_accounts_v3 to authenticated;
grant select on table public.paper_cash_balances_v3 to authenticated;
grant select on table public.paper_orders_v3 to authenticated;
grant select on table public.paper_fills_v3 to authenticated;

create or replace function public.create_paper_account_v3(
  p_user_id uuid,
  p_name text,
  p_base_currency text,
  p_starting_cash numeric
)
returns public.paper_accounts_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.paper_accounts_v3;
  v_name text := trim(p_name);
  v_currency text := upper(trim(p_base_currency));
begin
  if p_user_id is null then raise exception 'user id required'; end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'invalid account name';
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid base currency';
  end if;
  if p_starting_cash is null or p_starting_cash <= 0 or p_starting_cash > 1000000000000 then
    raise exception 'invalid starting cash';
  end if;

  insert into public.paper_accounts_v3 (user_id, name, base_currency)
  values (p_user_id, v_name, v_currency)
  returning * into v_account;

  insert into public.paper_cash_balances_v3 (account_id, user_id, currency, amount)
  values (v_account.id, p_user_id, v_currency, p_starting_cash);

  return v_account;
end;
$$;

create or replace function public.record_paper_rejection_v3(
  p_user_id uuid,
  p_account_id uuid,
  p_idempotency_key text,
  p_ticker text,
  p_side text,
  p_quantity numeric,
  p_rejection_reason text,
  p_submitted_at timestamptz
)
returns public.paper_orders_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.paper_orders_v3;
  v_ticker text := upper(trim(p_ticker));
  v_side text := lower(trim(p_side));
  v_idempotency_key text := trim(p_idempotency_key);
begin
  if p_user_id is null or p_account_id is null then raise exception 'account identity required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_account_id::text));

  if not exists (
    select 1 from public.paper_accounts_v3
    where id = p_account_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'paper account unavailable';
  end if;

  select * into v_order
  from public.paper_orders_v3
  where account_id = p_account_id and idempotency_key = v_idempotency_key;
  if found then return v_order; end if;

  if v_idempotency_key is null or char_length(v_idempotency_key) < 1 or char_length(v_idempotency_key) > 128 then
    raise exception 'invalid idempotency key';
  end if;
  if v_ticker is null or char_length(v_ticker) < 1 or char_length(v_ticker) > 32 then
    raise exception 'invalid ticker';
  end if;
  if v_side not in ('buy', 'sell') then raise exception 'invalid side'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'invalid quantity'; end if;
  if p_rejection_reason not in (
    'INVALID_ORDER',
    'DUPLICATE_IDEMPOTENCY_KEY',
    'LEDGER_INVALID',
    'MARKET_NOT_VERIFIED',
    'MARKET_TICKER_MISMATCH',
    'MARKET_PRICE_INVALID',
    'MARKET_CURRENCY_INVALID',
    'MARKET_TIMESTAMP_INVALID',
    'MARKET_OBSERVATION_FUTURE',
    'MARKET_OBSERVATION_STALE',
    'INSUFFICIENT_CASH',
    'INSUFFICIENT_POSITION'
  ) then
    raise exception 'invalid rejection reason';
  end if;
  if p_submitted_at is null or p_submitted_at > now() + interval '30 seconds' then
    raise exception 'invalid submission timestamp';
  end if;

  insert into public.paper_orders_v3 (
    account_id, user_id, idempotency_key, ticker, side, quantity,
    status, rejection_reason, submitted_at, policy_version
  ) values (
    p_account_id, p_user_id, v_idempotency_key, v_ticker, v_side, p_quantity,
    'rejected', p_rejection_reason, p_submitted_at, 'stockbox-paper-trading-v3.0.0'
  )
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.record_paper_fill_v3(
  p_user_id uuid,
  p_account_id uuid,
  p_idempotency_key text,
  p_ticker text,
  p_side text,
  p_quantity numeric,
  p_price numeric,
  p_currency text,
  p_market_observed_at timestamptz,
  p_provider text,
  p_market_verification text,
  p_executed_at timestamptz
)
returns public.paper_fills_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.paper_orders_v3;
  v_fill public.paper_fills_v3;
  v_ticker text := upper(trim(p_ticker));
  v_side text := lower(trim(p_side));
  v_currency text := upper(trim(p_currency));
  v_provider text := trim(p_provider);
  v_idempotency_key text := trim(p_idempotency_key);
  v_cash numeric;
  v_position_quantity numeric;
  v_gross numeric;
  v_fee numeric := 0;
begin
  if p_user_id is null or p_account_id is null then raise exception 'account identity required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_account_id::text));

  if not exists (
    select 1 from public.paper_accounts_v3
    where id = p_account_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'paper account unavailable';
  end if;

  select * into v_order
  from public.paper_orders_v3
  where account_id = p_account_id and idempotency_key = v_idempotency_key;
  if found then
    if v_order.status = 'filled' then
      select * into v_fill from public.paper_fills_v3 where order_id = v_order.id;
      if found then return v_fill; end if;
      raise exception 'filled order missing fill';
    end if;
    raise exception 'idempotency key already rejected';
  end if;

  if v_idempotency_key is null or char_length(v_idempotency_key) < 1 or char_length(v_idempotency_key) > 128 then
    raise exception 'invalid idempotency key';
  end if;
  if v_ticker is null or char_length(v_ticker) < 1 or char_length(v_ticker) > 32 then
    raise exception 'invalid ticker';
  end if;
  if v_side not in ('buy', 'sell') then raise exception 'invalid side'; end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000 then raise exception 'invalid quantity'; end if;
  if p_price is null or p_price <= 0 or p_price > 1000000000 then raise exception 'invalid price'; end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid currency'; end if;
  if v_provider is null or char_length(v_provider) < 1 or char_length(v_provider) > 120 then raise exception 'invalid provider'; end if;
  if p_market_verification is distinct from 'VERIFIED' then raise exception 'market observation not verified'; end if;
  if p_executed_at is null or p_market_observed_at is null then raise exception 'market timestamps required'; end if;
  if p_market_observed_at > p_executed_at + interval '30 seconds' then raise exception 'market observation is in the future'; end if;
  if p_executed_at - p_market_observed_at > interval '20 minutes' then raise exception 'market observation is stale'; end if;
  if p_executed_at > now() + interval '30 seconds' then raise exception 'execution timestamp is in the future'; end if;

  v_gross := p_quantity * p_price;

  if v_side = 'buy' then
    select amount into v_cash
    from public.paper_cash_balances_v3
    where account_id = p_account_id and user_id = p_user_id and currency = v_currency
    for update;

    if v_cash is null or v_cash + 0.000000001 < v_gross + v_fee then
      raise exception 'insufficient paper cash';
    end if;

    update public.paper_cash_balances_v3
    set amount = amount - v_gross - v_fee,
        updated_at = now()
    where account_id = p_account_id and user_id = p_user_id and currency = v_currency;
  else
    select coalesce(sum(case when side = 'buy' then quantity else -quantity end), 0)
      into v_position_quantity
    from public.paper_fills_v3
    where account_id = p_account_id
      and user_id = p_user_id
      and ticker = v_ticker
      and currency = v_currency;

    if v_position_quantity + 0.000000001 < p_quantity then
      raise exception 'insufficient paper position';
    end if;

    insert into public.paper_cash_balances_v3 (account_id, user_id, currency, amount, updated_at)
    values (p_account_id, p_user_id, v_currency, v_gross - v_fee, now())
    on conflict (account_id, currency) do update
    set amount = public.paper_cash_balances_v3.amount + excluded.amount,
        updated_at = now();
  end if;

  insert into public.paper_orders_v3 (
    account_id, user_id, idempotency_key, ticker, side, quantity,
    status, rejection_reason, submitted_at, policy_version
  ) values (
    p_account_id, p_user_id, v_idempotency_key, v_ticker, v_side, p_quantity,
    'filled', null, p_executed_at, 'stockbox-paper-trading-v3.0.0'
  )
  returning * into v_order;

  insert into public.paper_fills_v3 (
    account_id, order_id, user_id, ticker, side, quantity, price, fee,
    currency, executed_at, market_observed_at, provider, market_verification,
    pricing_basis, policy_version
  ) values (
    p_account_id, v_order.id, p_user_id, v_ticker, v_side, p_quantity, p_price, v_fee,
    v_currency, p_executed_at, p_market_observed_at, v_provider, 'VERIFIED',
    'VERIFIED_OBSERVATION_EXACT', 'stockbox-paper-trading-v3.0.0'
  )
  returning * into v_fill;

  return v_fill;
end;
$$;

revoke all on function public.create_paper_account_v3(uuid,text,text,numeric) from public, anon, authenticated;
revoke all on function public.record_paper_rejection_v3(uuid,uuid,text,text,text,numeric,text,timestamptz) from public, anon, authenticated;
revoke all on function public.record_paper_fill_v3(uuid,uuid,text,text,text,numeric,numeric,text,timestamptz,text,text,timestamptz) from public, anon, authenticated;

grant execute on function public.create_paper_account_v3(uuid,text,text,numeric) to service_role;
grant execute on function public.record_paper_rejection_v3(uuid,uuid,text,text,text,numeric,text,timestamptz) to service_role;
grant execute on function public.record_paper_fill_v3(uuid,uuid,text,text,text,numeric,numeric,text,timestamptz,text,text,timestamptz) to service_role;

commit;
