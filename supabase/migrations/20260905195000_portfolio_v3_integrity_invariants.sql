begin;

-- Portfolio V3 integrity invariant:
-- authenticated clients may read their own derived portfolio state, but all
-- mutations that can affect derived holdings must flow through the guarded RPCs.
-- StockBox-generated snapshots are persisted only by trusted server code.

-- Transactions remain owner-readable, but direct table mutation would bypass
-- private.rebuild_portfolio_holding() and can desynchronise derived holdings.
drop policy if exists "portfolio transactions insert own" on public.portfolio_transactions;
drop policy if exists "portfolio transactions update own" on public.portfolio_transactions;
drop policy if exists "portfolio transactions delete own" on public.portfolio_transactions;

revoke insert, update, delete on table public.portfolio_transactions from public, anon, authenticated;

-- Holdings are derived from the transaction ledger. Legacy direct-write policies
-- are incompatible with the transaction-ledger source-of-truth model.
drop policy if exists "holdings insert own" on public.holdings;
drop policy if exists "holdings update own" on public.holdings;
drop policy if exists "holdings delete own" on public.holdings;

revoke insert, update, delete on table public.holdings from public, anon, authenticated;

-- Portfolio snapshots are StockBox-computed audit/history records. Users can
-- read their own snapshots, but must not be able to forge or rewrite them.
drop policy if exists "portfolio snapshots own all" on public.portfolio_snapshots;
drop policy if exists "portfolio snapshots select own" on public.portfolio_snapshots;
create policy "portfolio snapshots select own" on public.portfolio_snapshots
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    and portfolio_id in (
      select id from public.portfolios where user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on table public.portfolio_snapshots from public, anon, authenticated;

-- The rebuild primitive is internal. Authenticated users mutate through the
-- owner-checked public transaction RPCs, never by invoking the primitive.
revoke all on function private.rebuild_portfolio_holding(uuid,text,text) from public, anon, authenticated;

-- Re-assert the only authenticated transaction mutation surface explicitly.
revoke all on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) from public, anon;
grant execute on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) to authenticated;
revoke all on function public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric) from public, anon;
grant execute on function public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric) to authenticated;
revoke all on function public.delete_portfolio_transaction(uuid) from public, anon;
grant execute on function public.delete_portfolio_transaction(uuid) to authenticated;

commit;
