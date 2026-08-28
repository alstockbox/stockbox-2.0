import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

describe("workspace entitlement enforcement", () => {
  it("atomically enforces watchlist limits in a service-role-only rpc", () => {
    expect(sql).toContain("create or replace function public.upsert_watchlist_item_with_entitlement");
    expect(sql).toContain("watchlistitems");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("grant execute on function public.upsert_watchlist_item_with_entitlement");
  });

  it("atomically enforces portfolio limits in a service-role-only rpc", () => {
    expect(sql).toContain("create or replace function public.create_portfolio_with_entitlement");
    expect(sql).toContain("portfolios");
    expect(sql).toContain("grant execute on function public.create_portfolio_with_entitlement");
  });

  it("gives affiliate ambassadors an explicit Stripe-independent workspace package", () => {
    expect(sql).toContain("if v_role = 'affiliate_ambassador' then");
    expect(sql).toContain("'watchlistitems', 75");
    expect(sql).toContain("'batchrows', 50");
    expect(sql).toContain("'portfolios', 5");
  });
});
