begin;

create table if not exists public.portfolio_transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  ticker text not null check (char_length(ticker) between 1 and 32),
  security_id text,
  transaction_type text not null check (transaction_type in ('buy', 'sell', 'fee', 'dividend')),
  quantity numeric(24,8) check (quantity is null or quantity > 0),
  price numeric(24,8) check (price is null or price >= 0),
  cash_amount numeric(24,8),
  fees numeric(24,8) not null default 0 check (fees >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  executed_at date not null,
  notes text check (notes is null or char_length(notes) <= 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (transaction_type in ('buy', 'sell') and quantity is not null and price is not null)
    or (transaction_type in ('fee', 'dividend') and cash_amount is not null)
  )
);

create index if not exists portfolio_transactions_portfolio_date_idx
  on public.portfolio_transactions (portfolio_id, executed_at desc, created_at desc);
create index if not exists portfolio_transactions_portfolio_ticker_idx
  on public.portfolio_transactions (portfolio_id, ticker, currency, executed_at);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  portfolio_value numeric(28,8),
  invested_capital numeric(28,8),
  unrealized_pl numeric(28,8),
  unrealized_pl_percent numeric(12,6),
  portfolio_score numeric(7,3),
  risk_score numeric(7,3),
  valuation_score numeric(7,3),
  quality_score numeric(7,3),
  growth_score numeric(7,3),
  momentum_score numeric(7,3),
  diversification_score numeric(7,3),
  holdings jsonb not null default '[]'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  analysis_summary jsonb not null default '{}'::jsonb,
  prices_updated_at timestamptz,
  analyses_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_snapshots_portfolio_created_idx
  on public.portfolio_snapshots (portfolio_id, created_at desc);
create index if not exists portfolio_snapshots_user_created_idx
  on public.portfolio_snapshots (user_id, created_at desc);

alter table public.portfolio_transactions enable row level security;
alter table public.portfolio_snapshots enable row level security;

drop policy if exists "portfolio transactions select own" on public.portfolio_transactions;
create policy "portfolio transactions select own" on public.portfolio_transactions
  for select to authenticated
  using (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));

drop policy if exists "portfolio transactions insert own" on public.portfolio_transactions;
create policy "portfolio transactions insert own" on public.portfolio_transactions
  for insert to authenticated
  with check (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));

drop policy if exists "portfolio transactions update own" on public.portfolio_transactions;
create policy "portfolio transactions update own" on public.portfolio_transactions
  for update to authenticated
  using (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())))
  with check (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));

drop policy if exists "portfolio transactions delete own" on public.portfolio_transactions;
create policy "portfolio transactions delete own" on public.portfolio_transactions
  for delete to authenticated
  using (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));

drop policy if exists "portfolio snapshots own all" on public.portfolio_snapshots;
create policy "portfolio snapshots own all" on public.portfolio_snapshots
  for all to authenticated
  using ((select auth.uid()) = user_id and portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())))
  with check ((select auth.uid()) = user_id and portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));

insert into public.portfolio_transactions (
  portfolio_id, ticker, transaction_type, quantity, price, fees, currency, executed_at, metadata
)
select
  h.portfolio_id,
  upper(h.ticker),
  'buy',
  h.quantity,
  h.average_cost,
  0,
  upper(h.currency),
  coalesce(h.acquired_at, h.created_at::date),
  jsonb_build_object('source', 'legacy_holding_backfill', 'legacy_holding_id', h.id)
from public.holdings h
where not exists (
  select 1 from public.portfolio_transactions t
  where t.portfolio_id = h.portfolio_id
    and t.metadata->>'legacy_holding_id' = h.id::text
);

create or replace function private.rebuild_portfolio_holding(
  p_portfolio_id uuid,
  p_ticker text,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_quantity numeric(24,8) := 0;
  v_cost_basis numeric(36,8) := 0;
  v_average numeric(36,8) := 0;
  v_first_date date := null;
  v_holding_id uuid;
begin
  for r in
    select transaction_type, quantity, price, fees, executed_at
    from public.portfolio_transactions
    where portfolio_id = p_portfolio_id
      and ticker = upper(p_ticker)
      and currency = upper(p_currency)
      and transaction_type in ('buy', 'sell')
    order by executed_at, created_at, id
  loop
    if r.transaction_type = 'buy' then
      v_cost_basis := v_cost_basis + (r.quantity * r.price) + coalesce(r.fees, 0);
      v_quantity := v_quantity + r.quantity;
      v_first_date := coalesce(v_first_date, r.executed_at);
    elsif r.transaction_type = 'sell' and v_quantity > 0 then
      if r.quantity > v_quantity then
        raise exception 'Sell quantity exceeds owned quantity';
      end if;
      v_average := v_cost_basis / v_quantity;
      v_cost_basis := greatest(0, v_cost_basis - (v_average * r.quantity));
      v_quantity := v_quantity - r.quantity;
    end if;
  end loop;

  select id into v_holding_id
  from public.holdings
  where portfolio_id = p_portfolio_id
    and ticker = upper(p_ticker)
    and currency = upper(p_currency)
  order by created_at, id
  limit 1;

  if v_quantity <= 0 then
    delete from public.holdings
    where portfolio_id = p_portfolio_id
      and ticker = upper(p_ticker)
      and currency = upper(p_currency);
    return;
  end if;

  v_average := v_cost_basis / v_quantity;
  if v_holding_id is null then
    insert into public.holdings (portfolio_id, ticker, quantity, average_cost, currency, acquired_at)
    values (p_portfolio_id, upper(p_ticker), v_quantity, v_average, upper(p_currency), v_first_date);
  else
    update public.holdings
    set quantity = v_quantity,
        average_cost = v_average,
        acquired_at = v_first_date
    where id = v_holding_id;
    delete from public.holdings
    where portfolio_id = p_portfolio_id
      and ticker = upper(p_ticker)
      and currency = upper(p_currency)
      and id <> v_holding_id;
  end if;
end;
$$;

create or replace function public.record_portfolio_transaction(
  p_portfolio_id uuid,
  p_ticker text,
  p_transaction_type text,
  p_quantity numeric,
  p_price numeric,
  p_currency text,
  p_executed_at date,
  p_fees numeric default 0,
  p_cash_amount numeric default null,
  p_security_id text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.portfolios where id = p_portfolio_id and user_id = (select auth.uid())) then
    raise exception 'Portfolio not found';
  end if;
  if p_transaction_type not in ('buy', 'sell', 'fee', 'dividend') then raise exception 'Invalid transaction type'; end if;
  if p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  if p_executed_at is null or p_executed_at > current_date + 1 then raise exception 'Invalid transaction date'; end if;
  if p_transaction_type in ('buy', 'sell') and (p_quantity is null or p_quantity <= 0 or p_price is null or p_price < 0) then
    raise exception 'Quantity and price are required';
  end if;
  if coalesce(p_fees, 0) < 0 then raise exception 'Fees cannot be negative'; end if;

  insert into public.portfolio_transactions (
    portfolio_id, ticker, security_id, transaction_type, quantity, price, cash_amount, fees, currency, executed_at, notes
  ) values (
    p_portfolio_id, upper(trim(p_ticker)), nullif(trim(p_security_id), ''), p_transaction_type,
    p_quantity, p_price, p_cash_amount, coalesce(p_fees, 0), upper(p_currency), p_executed_at, nullif(trim(p_notes), '')
  ) returning id into v_id;

  if p_transaction_type in ('buy', 'sell') then
    perform private.rebuild_portfolio_holding(p_portfolio_id, upper(trim(p_ticker)), upper(p_currency));
  end if;
  return v_id;
end;
$$;

create or replace function public.update_portfolio_transaction(
  p_transaction_id uuid,
  p_quantity numeric,
  p_price numeric,
  p_currency text,
  p_executed_at date,
  p_fees numeric default 0
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old record;
  v_new_currency text := upper(p_currency);
begin
  select t.* into v_old
  from public.portfolio_transactions t
  join public.portfolios p on p.id = t.portfolio_id
  where t.id = p_transaction_id and p.user_id = (select auth.uid());
  if not found then return false; end if;
  if v_old.transaction_type not in ('buy', 'sell') then return false; end if;
  if p_quantity is null or p_quantity <= 0 or p_price is null or p_price < 0 then return false; end if;
  if v_new_currency !~ '^[A-Z]{3}$' or p_executed_at is null or p_executed_at > current_date + 1 or coalesce(p_fees, 0) < 0 then return false; end if;

  update public.portfolio_transactions
  set quantity = p_quantity,
      price = p_price,
      currency = v_new_currency,
      executed_at = p_executed_at,
      fees = coalesce(p_fees, 0),
      updated_at = now()
  where id = p_transaction_id;

  perform private.rebuild_portfolio_holding(v_old.portfolio_id, v_old.ticker, v_old.currency);
  if v_old.currency <> v_new_currency then
    perform private.rebuild_portfolio_holding(v_old.portfolio_id, v_old.ticker, v_new_currency);
  end if;
  return true;
end;
$$;

create or replace function public.delete_portfolio_transaction(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old record;
begin
  select t.* into v_old
  from public.portfolio_transactions t
  join public.portfolios p on p.id = t.portfolio_id
  where t.id = p_transaction_id and p.user_id = (select auth.uid());
  if not found then return false; end if;

  delete from public.portfolio_transactions where id = p_transaction_id;
  if v_old.transaction_type in ('buy', 'sell') then
    perform private.rebuild_portfolio_holding(v_old.portfolio_id, v_old.ticker, v_old.currency);
  end if;
  return true;
end;
$$;

revoke all on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) from public, anon;
grant execute on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) to authenticated;
revoke all on function public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric) from public, anon;
grant execute on function public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric) to authenticated;
revoke all on function public.delete_portfolio_transaction(uuid) from public, anon;
grant execute on function public.delete_portfolio_transaction(uuid) to authenticated;

commit;
