begin;

create or replace function public.insert_portfolio_snapshot_if_current(
  p_portfolio_id uuid,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns table(id uuid, created_at timestamptz, ledger_revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_current_revision bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid ledger revision';
  end if;
  if not exists (
    select 1 from public.portfolios
    where public.portfolios.id = p_portfolio_id
      and public.portfolios.user_id = v_user_id
  ) then
    raise exception 'Portfolio not found';
  end if;

  insert into public.portfolio_ledger_revisions (portfolio_id, revision)
  values (p_portfolio_id, 0)
  on conflict (portfolio_id) do nothing;

  select r.revision
  into v_current_revision
  from public.portfolio_ledger_revisions r
  where r.portfolio_id = p_portfolio_id
  for update;

  if v_current_revision is distinct from p_expected_revision then
    return;
  end if;

  if jsonb_array_length(coalesce(p_snapshot->'holdings', '[]'::jsonb)) = 0 then
    return query
    select s.id, s.created_at, s.ledger_revision
    from public.portfolio_snapshots s
    where s.portfolio_id = p_portfolio_id
      and s.user_id = v_user_id
      and s.ledger_revision = v_current_revision
      and jsonb_array_length(coalesce(s.holdings, '[]'::jsonb)) = 0
    order by s.created_at desc
    limit 1;

    if found then
      return;
    end if;
  end if;

  return query
  insert into public.portfolio_snapshots (
    portfolio_id,
    user_id,
    base_currency,
    portfolio_value,
    invested_capital,
    unrealized_pl,
    unrealized_pl_percent,
    realized_pl,
    dividend_income,
    standalone_fees,
    trading_fees,
    total_fees,
    total_pl,
    portfolio_score,
    risk_score,
    valuation_score,
    quality_score,
    growth_score,
    momentum_score,
    diversification_score,
    holdings,
    failures,
    analysis_summary,
    prices_updated_at,
    analyses_updated_at,
    ledger_revision
  ) values (
    p_portfolio_id,
    v_user_id,
    p_snapshot->>'base_currency',
    (p_snapshot->>'portfolio_value')::numeric,
    (p_snapshot->>'invested_capital')::numeric,
    (p_snapshot->>'unrealized_pl')::numeric,
    (p_snapshot->>'unrealized_pl_percent')::numeric,
    (p_snapshot->>'realized_pl')::numeric,
    (p_snapshot->>'dividend_income')::numeric,
    (p_snapshot->>'standalone_fees')::numeric,
    (p_snapshot->>'trading_fees')::numeric,
    (p_snapshot->>'total_fees')::numeric,
    (p_snapshot->>'total_pl')::numeric,
    (p_snapshot->>'portfolio_score')::numeric,
    (p_snapshot->>'risk_score')::numeric,
    (p_snapshot->>'valuation_score')::numeric,
    (p_snapshot->>'quality_score')::numeric,
    (p_snapshot->>'growth_score')::numeric,
    (p_snapshot->>'momentum_score')::numeric,
    (p_snapshot->>'diversification_score')::numeric,
    coalesce(p_snapshot->'holdings', '[]'::jsonb),
    coalesce(p_snapshot->'failures', '[]'::jsonb),
    coalesce(p_snapshot->'analysis_summary', '{}'::jsonb),
    (p_snapshot->>'prices_updated_at')::timestamptz,
    (p_snapshot->>'analyses_updated_at')::timestamptz,
    v_current_revision
  )
  returning portfolio_snapshots.id, portfolio_snapshots.created_at, portfolio_snapshots.ledger_revision;
end;
$$;

revoke all on function public.insert_portfolio_snapshot_if_current(uuid,bigint,jsonb) from public, anon;
grant execute on function public.insert_portfolio_snapshot_if_current(uuid,bigint,jsonb) to authenticated;

commit;
