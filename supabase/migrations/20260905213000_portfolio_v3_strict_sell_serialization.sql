begin;

-- Portfolio V3 ledger invariants:
-- 1. Every buy/sell mutation for a portfolio is serialized on the owning
--    portfolio row so concurrent requests cannot both validate against stale
--    position state.
-- 2. Rebuilding a position rejects every sell that occurs before enough shares
--    have been acquired. This also protects edits/deletes that reorder history.

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
    elsif r.transaction_type = 'sell' then
      if v_quantity <= 0 or r.quantity > v_quantity then
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

  perform 1
  from public.portfolios
  where id = p_portfolio_id and user_id = (select auth.uid())
  for update;
  if not found then raise exception 'Portfolio not found'; end if;

  if p_transaction_type not in ('buy', 'sell', 'fee', 'dividend') then raise exception 'Invalid transaction type'; end if;
  if p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
  if p_executed_at is null or p_executed_at > current_date + 1 then raise exception 'Invalid transaction date'; end if;
  if p_transaction_type in ('buy', 'sell') and (p_quantity is null or p_quantity <= 0 or p_price is null or p_price < 0) then
    raise exception 'Quantity and price are required';
  end if;
  if p_transaction_type in ('fee', 'dividend') and p_cash_amount is null then raise exception 'Cash amount is required'; end if;
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
  if (select auth.uid()) is null then return false; end if;

  select t.* into v_old
  from public.portfolio_transactions t
  join public.portfolios p on p.id = t.portfolio_id
  where t.id = p_transaction_id and p.user_id = (select auth.uid())
  for update of p, t;
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
  if (select auth.uid()) is null then return false; end if;

  select t.* into v_old
  from public.portfolio_transactions t
  join public.portfolios p on p.id = t.portfolio_id
  where t.id = p_transaction_id and p.user_id = (select auth.uid())
  for update of p, t;
  if not found then return false; end if;

  delete from public.portfolio_transactions where id = p_transaction_id;
  if v_old.transaction_type in ('buy', 'sell') then
    perform private.rebuild_portfolio_holding(v_old.portfolio_id, v_old.ticker, v_old.currency);
  end if;
  return true;
end;
$$;

revoke all on function private.rebuild_portfolio_holding(uuid,text,text) from public, anon, authenticated;

revoke all on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) from public, anon;
grant execute on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) to authenticated;
revoke all on function public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric) from public, anon;
grant execute on function public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric) to authenticated;
revoke all on function public.delete_portfolio_transaction(uuid) from public, anon;
grant execute on function public.delete_portfolio_transaction(uuid) to authenticated;

commit;
