begin;

create table if not exists public.portfolio_ledger_revisions (
  portfolio_id uuid primary key references public.portfolios(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.portfolio_ledger_revisions enable row level security;

drop policy if exists "portfolio ledger revisions select own" on public.portfolio_ledger_revisions;
create policy "portfolio ledger revisions select own" on public.portfolio_ledger_revisions
  for select to authenticated
  using (portfolio_id in (select id from public.portfolios where user_id = (select auth.uid())));

insert into public.portfolio_ledger_revisions (portfolio_id, revision)
select id, 0
from public.portfolios
on conflict (portfolio_id) do nothing;

create or replace function private.initialize_portfolio_ledger_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.portfolio_ledger_revisions (portfolio_id, revision)
  values (new.id, 0)
  on conflict (portfolio_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_portfolio_ledger_revision on public.portfolios;
create trigger initialize_portfolio_ledger_revision
after insert on public.portfolios
for each row execute function private.initialize_portfolio_ledger_revision();

create or replace function private.bump_portfolio_ledger_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_portfolio_id uuid;
  v_new_portfolio_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_portfolio_id := old.portfolio_id;
  end if;
  if tg_op <> 'DELETE' then
    v_new_portfolio_id := new.portfolio_id;
  end if;

  if v_old_portfolio_id is not null then
    insert into public.portfolio_ledger_revisions (portfolio_id, revision, updated_at)
    values (v_old_portfolio_id, 1, now())
    on conflict (portfolio_id) do update
      set revision = public.portfolio_ledger_revisions.revision + 1,
          updated_at = now();
  end if;

  if v_new_portfolio_id is not null and v_new_portfolio_id is distinct from v_old_portfolio_id then
    insert into public.portfolio_ledger_revisions (portfolio_id, revision, updated_at)
    values (v_new_portfolio_id, 1, now())
    on conflict (portfolio_id) do update
      set revision = public.portfolio_ledger_revisions.revision + 1,
          updated_at = now();
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists bump_portfolio_ledger_revision on public.portfolio_transactions;
create trigger bump_portfolio_ledger_revision
after insert or update or delete on public.portfolio_transactions
for each row execute function private.bump_portfolio_ledger_revision();

alter table public.portfolio_snapshots
  add column if not exists ledger_revision bigint not null default 0 check (ledger_revision >= 0);

create index if not exists portfolio_snapshots_portfolio_revision_created_idx
  on public.portfolio_snapshots (portfolio_id, ledger_revision desc, created_at desc);

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
