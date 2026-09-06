begin;

-- Preserve the existing active 20-minute mark-to-market policy while adding a
-- separate, explicitly versioned final policy. The two pricing bases may never
-- be mixed under one policy version.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname, pg_catalog.pg_get_constraintdef(c.oid) as definition
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.paper_performance_snapshots_v3'::pg_catalog.regclass
      and c.contype = 'c'
      and (
        pg_catalog.pg_get_constraintdef(c.oid) ilike '%policy_version%'
        or pg_catalog.pg_get_constraintdef(c.oid) ilike '%pricing_basis%'
        or (
          pg_catalog.pg_get_constraintdef(c.oid) ilike '%oldest_quote_observed_at%'
          and pg_catalog.pg_get_constraintdef(c.oid) ilike '%20 minutes%'
        )
      )
  loop
    execute pg_catalog.format(
      'alter table public.paper_performance_snapshots_v3 drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.paper_performance_snapshots_v3
  add constraint paper_performance_snapshots_v3_policy_basis_v3_check
  check (
    (policy_version = 'stockbox-paper-performance-v3.0.0'
      and pricing_basis = 'VERIFIED_MARK_TO_MARKET')
    or
    (policy_version = 'stockbox-paper-final-performance-v3.0.0'
      and pricing_basis = 'VERIFIED_LAST_TRADE_AT_OR_BEFORE_CUTOFF')
  ),
  add constraint paper_performance_snapshots_v3_quote_age_policy_v3_check
  check (
    oldest_quote_observed_at is null
    or (
      oldest_quote_observed_at <= evaluated_at + interval '30 seconds'
      and (
        (policy_version = 'stockbox-paper-performance-v3.0.0'
          and evaluated_at - oldest_quote_observed_at <= interval '20 minutes')
        or
        (policy_version = 'stockbox-paper-final-performance-v3.0.0'
          and evaluated_at - oldest_quote_observed_at <= interval '7 days')
      )
    )
  );

create or replace function public.record_paper_final_performance_snapshot_v3(
  p_user_id uuid,
  p_account_id uuid,
  p_base_currency text,
  p_cash_value numeric,
  p_positions_market_value numeric,
  p_open_position_count integer,
  p_quote_count integer,
  p_evaluated_at timestamptz,
  p_oldest_quote_observed_at timestamptz
)
returns public.paper_performance_snapshots_v3
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.paper_performance_snapshots_v3;
  v_currency text := upper(trim(p_base_currency));
  v_account_currency text;
  v_account_starting_cash numeric(30,10);
  v_account_type text;
  v_account_competition_id uuid;
  v_competition_status text;
  v_competition_currency text;
  v_competition_ends_at timestamptz;
  v_cash_value numeric(30,10);
  v_positions_market_value numeric(30,10);
  v_equity numeric(30,10);
  v_profit_loss numeric(30,10);
  v_return_percent numeric(24,10);
begin
  if p_user_id is null or p_account_id is null then
    raise exception 'paper final snapshot identity required';
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid paper final snapshot currency';
  end if;
  if p_cash_value is null or p_cash_value < 0 or p_cash_value > 1000000000000000 then
    raise exception 'invalid paper final snapshot cash';
  end if;
  if p_positions_market_value is null or p_positions_market_value < 0 or p_positions_market_value > 1000000000000000 then
    raise exception 'invalid paper final snapshot market value';
  end if;
  if p_open_position_count is null or p_open_position_count < 0 or p_open_position_count > 100000 then
    raise exception 'invalid paper final snapshot position count';
  end if;
  if p_quote_count is null or p_quote_count <> p_open_position_count then
    raise exception 'paper final snapshot quote coverage incomplete';
  end if;
  if p_evaluated_at is null or p_evaluated_at > pg_catalog.now() + interval '30 seconds' then
    raise exception 'invalid paper final snapshot evaluation time';
  end if;
  if p_quote_count = 0 and p_oldest_quote_observed_at is not null then
    raise exception 'unexpected paper final snapshot quote timestamp';
  end if;
  if p_quote_count > 0 and p_oldest_quote_observed_at is null then
    raise exception 'paper final snapshot quote timestamp required';
  end if;
  if p_oldest_quote_observed_at is not null
    and p_oldest_quote_observed_at > p_evaluated_at + interval '30 seconds'
  then
    raise exception 'paper final snapshot quote timestamp is future';
  end if;
  if p_oldest_quote_observed_at is not null
    and p_evaluated_at - p_oldest_quote_observed_at > interval '7 days'
  then
    raise exception 'paper final snapshot quote is outside bounded lookback';
  end if;

  select base_currency, starting_cash, account_type, competition_id
    into v_account_currency, v_account_starting_cash, v_account_type, v_account_competition_id
  from public.paper_accounts_v3
  where id = p_account_id
    and user_id = p_user_id
    and status = 'active'
    and account_type = 'competition';

  if not found or v_account_type <> 'competition' or v_account_competition_id is null then
    raise exception 'paper final competition account unavailable';
  end if;
  if v_account_currency <> v_currency or v_account_starting_cash <> 100000 then
    raise exception 'paper final snapshot account invariant failed';
  end if;

  select status, base_currency, ends_at
    into v_competition_status, v_competition_currency, v_competition_ends_at
  from public.paper_competitions_v3
  where id = v_account_competition_id;

  if not found
    or v_competition_status <> 'completed'
    or v_competition_currency <> v_currency
    or p_evaluated_at <> v_competition_ends_at
  then
    raise exception 'paper final snapshot competition boundary invalid';
  end if;

  v_cash_value := pg_catalog.round(p_cash_value, 10);
  v_positions_market_value := pg_catalog.round(p_positions_market_value, 10);
  v_equity := v_cash_value + v_positions_market_value;
  v_profit_loss := v_equity - v_account_starting_cash;
  v_return_percent := pg_catalog.round((v_profit_loss / v_account_starting_cash) * 100, 10);

  select * into v_snapshot
  from public.paper_performance_snapshots_v3
  where account_id = p_account_id
    and evaluated_at = p_evaluated_at
    and policy_version = 'stockbox-paper-final-performance-v3.0.0';

  if found then
    if v_snapshot.user_id is distinct from p_user_id
      or v_snapshot.base_currency is distinct from v_currency
      or v_snapshot.starting_cash is distinct from v_account_starting_cash
      or v_snapshot.cash_value is distinct from v_cash_value
      or v_snapshot.positions_market_value is distinct from v_positions_market_value
      or v_snapshot.open_position_count is distinct from p_open_position_count
      or v_snapshot.quote_count is distinct from p_quote_count
      or v_snapshot.oldest_quote_observed_at is distinct from p_oldest_quote_observed_at
      or v_snapshot.pricing_basis is distinct from 'VERIFIED_LAST_TRADE_AT_OR_BEFORE_CUTOFF'
    then
      raise exception 'paper final snapshot idempotency conflict';
    end if;
    return v_snapshot;
  end if;

  insert into public.paper_performance_snapshots_v3 (
    account_id,
    user_id,
    base_currency,
    starting_cash,
    cash_value,
    positions_market_value,
    equity,
    profit_loss,
    return_percent,
    open_position_count,
    quote_count,
    evaluated_at,
    oldest_quote_observed_at,
    policy_version,
    pricing_basis
  ) values (
    p_account_id,
    p_user_id,
    v_currency,
    v_account_starting_cash,
    v_cash_value,
    v_positions_market_value,
    v_equity,
    v_profit_loss,
    v_return_percent,
    p_open_position_count,
    p_quote_count,
    p_evaluated_at,
    p_oldest_quote_observed_at,
    'stockbox-paper-final-performance-v3.0.0',
    'VERIFIED_LAST_TRADE_AT_OR_BEFORE_CUTOFF'
  )
  on conflict (account_id, evaluated_at, policy_version) do nothing
  returning * into v_snapshot;

  if v_snapshot.id is null then
    select * into v_snapshot
    from public.paper_performance_snapshots_v3
    where account_id = p_account_id
      and evaluated_at = p_evaluated_at
      and policy_version = 'stockbox-paper-final-performance-v3.0.0';

    if v_snapshot.id is null
      or v_snapshot.user_id is distinct from p_user_id
      or v_snapshot.base_currency is distinct from v_currency
      or v_snapshot.starting_cash is distinct from v_account_starting_cash
      or v_snapshot.cash_value is distinct from v_cash_value
      or v_snapshot.positions_market_value is distinct from v_positions_market_value
      or v_snapshot.open_position_count is distinct from p_open_position_count
      or v_snapshot.quote_count is distinct from p_quote_count
      or v_snapshot.oldest_quote_observed_at is distinct from p_oldest_quote_observed_at
      or v_snapshot.pricing_basis is distinct from 'VERIFIED_LAST_TRADE_AT_OR_BEFORE_CUTOFF'
    then
      raise exception 'paper final snapshot persistence conflict';
    end if;
  end if;

  return v_snapshot;
end;
$$;

revoke all on function public.record_paper_final_performance_snapshot_v3(uuid,uuid,text,numeric,numeric,integer,integer,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.record_paper_final_performance_snapshot_v3(uuid,uuid,text,numeric,numeric,integer,integer,timestamptz,timestamptz) to service_role;

commit;
