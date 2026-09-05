import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260905213000_portfolio_v3_strict_sell_serialization.sql", import.meta.url),
  "utf8",
);

describe("Portfolio V3 strict ledger serialization", () => {
  it("rejects a sell whenever the historical ledger does not own enough shares", () => {
    expect(migration).toContain("elsif r.transaction_type = 'sell' then");
    expect(migration).toContain("if v_quantity <= 0 or r.quantity > v_quantity then");
    expect(migration).toContain("raise exception 'Sell quantity exceeds owned quantity'");
  });

  it("serializes new ledger mutations on the owner-checked portfolio row", () => {
    const recordStart = migration.indexOf("create or replace function public.record_portfolio_transaction");
    const updateStart = migration.indexOf("create or replace function public.update_portfolio_transaction");
    const recordBody = migration.slice(recordStart, updateStart);
    expect(recordBody).toContain("where id = p_portfolio_id and user_id = (select auth.uid())");
    expect(recordBody).toContain("for update;");
    expect(recordBody.indexOf("for update;")).toBeLessThan(recordBody.indexOf("insert into public.portfolio_transactions"));
  });

  it("locks both portfolio ownership and the edited transaction before update", () => {
    const updateStart = migration.indexOf("create or replace function public.update_portfolio_transaction");
    const deleteStart = migration.indexOf("create or replace function public.delete_portfolio_transaction");
    const updateBody = migration.slice(updateStart, deleteStart);
    expect(updateBody).toContain("p.user_id = (select auth.uid())");
    expect(updateBody).toContain("for update of p, t;");
  });

  it("locks both portfolio ownership and the transaction before delete", () => {
    const deleteStart = migration.indexOf("create or replace function public.delete_portfolio_transaction");
    const grantsStart = migration.indexOf("revoke all on function private.rebuild_portfolio_holding");
    const deleteBody = migration.slice(deleteStart, grantsStart);
    expect(deleteBody).toContain("p.user_id = (select auth.uid())");
    expect(deleteBody).toContain("for update of p, t;");
    expect(deleteBody.indexOf("for update of p, t;")).toBeLessThan(deleteBody.indexOf("delete from public.portfolio_transactions"));
  });

  it("keeps the rebuild primitive private and public RPCs authenticated-only", () => {
    expect(migration).toContain("revoke all on function private.rebuild_portfolio_holding(uuid,text,text) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) to authenticated;");
    expect(migration).toContain("grant execute on function public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric) to authenticated;");
    expect(migration).toContain("grant execute on function public.delete_portfolio_transaction(uuid) to authenticated;");
  });
});
