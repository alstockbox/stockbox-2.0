import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260905195000_portfolio_v3_integrity_invariants.sql", import.meta.url),
  "utf8",
);
const snapshotRoute = readFileSync(
  new URL("../../src/app/api/portfolio/snapshot/route.ts", import.meta.url),
  "utf8",
);
const workspaceActions = readFileSync(
  new URL("../../src/lib/workspace/actions.ts", import.meta.url),
  "utf8",
);
const portfolioPage = readFileSync(
  new URL("../../src/app/portfolio/page.tsx", import.meta.url),
  "utf8",
);

describe("Portfolio V3 integrity invariants", () => {
  it("makes the transaction ledger read-only to direct authenticated table DML", () => {
    expect(migration).toContain('drop policy if exists "portfolio transactions insert own"');
    expect(migration).toContain('drop policy if exists "portfolio transactions update own"');
    expect(migration).toContain('drop policy if exists "portfolio transactions delete own"');
    expect(migration).toContain(
      "revoke insert, update, delete on table public.portfolio_transactions from public, anon, authenticated;",
    );
  });

  it("treats holdings as derived state rather than a second writable source of truth", () => {
    expect(migration).toContain('drop policy if exists "holdings insert own"');
    expect(migration).toContain('drop policy if exists "holdings update own"');
    expect(migration).toContain('drop policy if exists "holdings delete own"');
    expect(migration).toContain(
      "revoke insert, update, delete on table public.holdings from public, anon, authenticated;",
    );
  });

  it("allows users to read snapshots but not forge computed snapshot history", () => {
    expect(migration).toContain('create policy "portfolio snapshots select own"');
    expect(migration).toContain("for select to authenticated");
    expect(migration).toContain(
      "revoke insert, update, delete on table public.portfolio_snapshots from public, anon, authenticated;",
    );
  });

  it("keeps authenticated transaction mutation behind owner-checked RPCs", () => {
    expect(migration).toContain(
      "grant execute on function public.record_portfolio_transaction(uuid,text,text,numeric,numeric,text,date,numeric,numeric,text,text) to authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.update_portfolio_transaction(uuid,numeric,numeric,text,date,numeric) to authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.delete_portfolio_transaction(uuid) to authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function private.rebuild_portfolio_holding(uuid,text,text) from public, anon, authenticated;",
    );
  });

  it("persists computed snapshots through the trusted server client only after ownership lookup", () => {
    const ownershipCheck = snapshotRoute.indexOf('.eq("user_id", user.id).maybeSingle()');
    const adminStore = snapshotRoute.indexOf("const snapshotStore = createAdminClient();");
    const snapshotInsert = snapshotRoute.indexOf('snapshotStore.from("portfolio_snapshots").insert({');

    expect(snapshotRoute).toContain('import { createAdminClient } from "@/lib/supabase/admin";');
    expect(ownershipCheck).toBeGreaterThan(-1);
    expect(adminStore).toBeGreaterThan(ownershipCheck);
    expect(snapshotInsert).toBeGreaterThan(adminStore);
    expect(snapshotRoute).not.toContain('supabase.from("portfolio_snapshots").insert({');
  });

  it("routes the active portfolio transaction UI through transaction RPC server actions", () => {
    expect(portfolioPage).toContain("addHoldingAction");
    expect(portfolioPage).toContain("updatePortfolioTransactionAction");
    expect(portfolioPage).toContain("removePortfolioTransactionAction");
    expect(portfolioPage).not.toContain("updateHoldingAction");
    expect(portfolioPage).not.toContain("removeHoldingAction");

    expect(workspaceActions).toContain('rpc("record_portfolio_transaction"');
    expect(workspaceActions).toContain('rpc("update_portfolio_transaction"');
    expect(workspaceActions).toContain('rpc("delete_portfolio_transaction"');
  });
});
