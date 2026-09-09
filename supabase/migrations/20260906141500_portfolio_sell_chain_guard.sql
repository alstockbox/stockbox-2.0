begin;

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

commit;
