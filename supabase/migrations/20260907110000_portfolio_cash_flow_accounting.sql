begin;

alter table public.portfolio_snapshots
  add column if not exists realized_pl numeric(28,8),
  add column if not exists dividend_income numeric(28,8),
  add column if not exists standalone_fees numeric(28,8),
  add column if not exists trading_fees numeric(28,8),
  add column if not exists total_fees numeric(28,8),
  add column if not exists total_pl numeric(28,8);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portfolio_transactions_cash_amount_nonnegative'
      and conrelid = 'public.portfolio_transactions'::regclass
  ) then
    alter table public.portfolio_transactions
      add constraint portfolio_transactions_cash_amount_nonnegative
      check (
        transaction_type not in ('fee', 'dividend')
        or cash_amount >= 0
      );
  end if;
end
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
  if p_transaction_type in ('fee', 'dividend') and (p_cash_amount is null or p_cash_amount < 0) then
    raise exception 'Cash amount must be nonnegative';
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

revoke all on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) from public, anon;
grant execute on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) to authenticated;

commit;
