begin;

create or replace function public.update_portfolio_cash_flow_transaction(
  p_transaction_id uuid,
  p_cash_amount numeric,
  p_currency text,
  p_executed_at date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text := upper(trim(p_currency));
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  if p_cash_amount is null or p_cash_amount < 0 then
    return false;
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    return false;
  end if;
  if p_executed_at is null or p_executed_at > current_date + 1 then
    return false;
  end if;

  update public.portfolio_transactions t
  set cash_amount = p_cash_amount,
      currency = v_currency,
      executed_at = p_executed_at,
      updated_at = now()
  from public.portfolios p
  where t.id = p_transaction_id
    and p.id = t.portfolio_id
    and p.user_id = (select auth.uid())
    and t.transaction_type in ('fee', 'dividend');

  return found;
end;
$$;

revoke all on function public.update_portfolio_cash_flow_transaction(uuid,numeric,text,date) from public, anon;
grant execute on function public.update_portfolio_cash_flow_transaction(uuid,numeric,text,date) to authenticated;

commit;
