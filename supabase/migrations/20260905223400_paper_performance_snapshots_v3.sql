begin;

create table if not exists public.paper_performance_snapshots_v3 (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  starting_cash numeric(30,10) not null check (starting_cash = 100000),
  cash_value numeric(30,10) not null check (cash_value >= 0 and cash_value <= 1000000000000000),
  positions_market_value numeric(30,10) not null check (positions_market_value >= 0 and positions_market_value <= 1000000000000000),
  equity numeric(30,10) not null check (equity >= 0 and equity <= 2000000000000000),
  profit_loss numeric(30,10) not null,
  return_percent numeric(24,10) not null,
  open_position_count integer not null check (open_position_count between 0 and 100000),
  quote_count integer not null check (quote_count between 0 and 100000),
  evaluated_at timestamptz not null,
  oldest_quote_observed_at timestamptz,
  policy_version text not null check (policy_version = 'stockbox-paper-performance-v3.0.0'),
  pricing_basis text not null check (pricing_basis = 'VERIFIED_MARK_TO_MARKET'),
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id)
    references public.paper_accounts_v3(id, user_id)
    on delete cascade,
  unique (account_id, evaluated_at, policy_version),
  check (quote_count = open_position_count),
  check (
    (quote_count = 0 and oldest_quote_observed_at is null)
    or (quote_count > 0 and oldest_quote_observed_at is not null)
  ),
  check (equity = cash_value + positions_market_value),
  check (profit_loss = equity - starting_cash),
  check (return_percent = (profit_loss / starting_cash) * 100),
  check (oldest_quote_observed_at is null or oldest_quote_observed_at <= evaluated_at + interval '30 seconds'),
  check (oldest_quote_observed_at is null or evaluated_at - oldest_quote_observed_at <= interval '20 minutes')
);

create index if not exists paper_performance_snapshots_v3_account_evaluated_idx
  on public.paper_performance_snapshots_v3 (account_id, evaluated_at desc);
create index if not exists paper_performance_snapshots_v3_user_evaluated_idx
  on public.paper_performance_snapshots_v3 (user_id, evaluated_at desc);
create index if not exists paper_performance_snapshots_v3_currency_policy_return_idx
  on public.paper_performance_snapshots_v3 (base_currency, policy_version, evaluated_at desc, return_percent desc);

alter table public.paper_performance_snapshots_v3 enable row level security;

drop policy if exists "paper performance snapshots v3 select own" on public.paper_performance_snapshots_v3;
create policy "paper performance snapshots v3 select own" on public.paper_performance_snapshots_v3
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.paper_performance_snapshots_v3 from public, anon, authenticated;
grant select on table public.paper_performance_snapshots_v3 to authenticated;

create or replace function public.record_paper_performance_snapshot_v3(
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
  v_equity numeric(30,10);
  v_profit_loss numeric(30,10);
  v_return_percent numeric(24,10);
begin
  if p_user_id is null or p_account_id is null then
    raise exception 'paper snapshot identity required';
  end if;
  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid paper snapshot currency';
  end if;
  if p_cash_value is null or p_cash_value < 0 or p_cash_value > 1000000000000000 then
    raise exception 'invalid paper snapshot cash';
  end if;
  if p_positions_market_value is null or p_positions_market_value < 0 or p_positions_market_value > 1000000000000000 then
    raise exception 'invalid paper snapshot market value';
  end if;
  if p_open_position_count is null or p_open_position_count < 0 or p_open_position_count > 100000 then
    raise exception 'invalid paper snapshot position count';
  end if;
  if p_quote_count is null or p_quote_count <> p_open_position_count then
    raise exception 'paper snapshot quote coverage incomplete';
  end if;
  if p_evaluated_at is null or p_evaluated_at > now() + interval '30 seconds' then
    raise exception 'invalid paper snapshot evaluation time';
  end if;
  if p_quote_count = 0 and p_oldest_quote_observed_at is not null then
    raise exception 'unexpected paper snapshot quote timestamp';
  end if;
  if p_quote_count > 0 and p_oldest_quote_observed_at is null then
    raise exception 'paper snapshot quote timestamp required';
  end if;
  if p_oldest_quote_observed_at is not null and p_oldest_quote_observed_at > p_evaluated_at + interval '30 seconds' then
    raise exception 'paper snapshot quote timestamp is future';
  end if;
  if p_oldest_quote_observed_at is not null and p_evaluated_at - p_oldest_quote_observed_at > interval '20 minutes' then
    raise exception 'paper snapshot quote is stale';
  end if;

  select base_currency, starting_cash
    into v_account_currency, v_account_starting_cash
  from public.paper_accounts_v3
  where id = p_account_id
    and user_id = p_user_id
    and status = 'active';

  if not found then
    raise exception 'paper account unavailable';
  end if;
  if v_account_currency <> v_currency then
    raise exception 'paper snapshot currency mismatch';
  end if;
  if v_account_starting_cash <> 100000 then
    raise exception 'paper snapshot starting capital invariant failed';
  end if;

  v_equity := p_cash_value + p_positions_market_value;
  v_profit_loss := v_equity - v_account_starting_cash;
  v_return_percent := (v_profit_loss / v_account_starting_cash) * 100;

  select * into v_snapshot
  from public.paper_performance_snapshots_v3
  where account_id = p_account_id
    and evaluated_at = p_evaluated_at
    and policy_version = 'stockbox-paper-performance-v3.0.0';
  if found then
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
    p_cash_value,
    p_positions_market_value,
    v_equity,
    v_profit_loss,
    v_return_percent,
    p_open_position_count,
    p_quote_count,
    p_evaluated_at,
    p_oldest_quote_observed_at,
    'stockbox-paper-performance-v3.0.0',
    'VERIFIED_MARK_TO_MARKET'
  )
  on conflict (account_id, evaluated_at, policy_version) do nothing
  returning * into v_snapshot;

  if v_snapshot.id is null then
    select * into v_snapshot
    from public.paper_performance_snapshots_v3
    where account_id = p_account_id
      and evaluated_at = p_evaluated_at
      and policy_version = 'stockbox-paper-performance-v3.0.0';
  end if;

  if v_snapshot.id is null then
    raise exception 'paper snapshot persistence failed';
  end if;

  return v_snapshot;
end;
$$;

revoke all on function public.record_paper_performance_snapshot_v3(uuid,uuid,text,numeric,numeric,integer,integer,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.record_paper_performance_snapshot_v3(uuid,uuid,text,numeric,numeric,integer,integer,timestamptz,timestamptz) to service_role;

commit;