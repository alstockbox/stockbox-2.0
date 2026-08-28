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

describe("affiliate ambassador database role", () => {
  it("adds the role without allowing authenticated users to update profile roles", () => {
    expect(sql).toContain("affiliate_ambassador");
    expect(sql).toContain("revoke update on public.profiles from authenticated");
  });

  it("stores one service-only custom entitlement row per ambassador", () => {
    expect(sql).toContain("create table if not exists public.ambassador_entitlements");
    expect(sql).toContain("user_id uuid primary key references public.profiles(id) on delete cascade");
    expect(sql).toContain("check (monthly_analyses between 0 and 100000)");
    expect(sql).toContain("check (deep_analyses between 0 and 100000)");
    expect(sql).toContain("check (deep_analyses <= monthly_analyses)");
    expect(sql).toContain("check (batch_rows between 0 and 50)");
    expect(sql).toContain("alter table public.ambassador_entitlements enable row level security");
  });

  it("backfills existing ambassadors with the historical package", () => {
    expect(sql).toContain("insert into public.ambassador_entitlements");
    expect(sql).toContain("100, 100, 50, 75, 5");
  });
});

describe("affiliate ambassador admin mutation", () => {
  it("updates role, limits, commission, affiliate status and audit log atomically", () => {
    expect(sql).toContain("create or replace function public.set_affiliate_ambassador_access");
    expect(sql).toContain("commission_basis_points");
    expect(sql).toContain("insert into public.audit_logs");
    expect(sql).toContain("for update");
    expect(sql).toContain("set status = 'inactive'");
    expect(sql).toContain("revoke all on function public.set_affiliate_ambassador_access");
    expect(sql).toContain("grant execute on function public.set_affiliate_ambassador_access");
    expect(sql).toContain("to service_role");
  });
});

describe("affiliate ambassador entitlement resolution", () => {
  it("loads custom analysis and workspace limits with historical fail-safe defaults", () => {
    expect(sql).toContain("from public.ambassador_entitlements");
    expect(sql).toContain("coalesce(v_ambassador.monthly_analyses, 100)");
    expect(sql).toContain("coalesce(v_ambassador.deep_analyses, 100)");
    expect(sql).toContain("coalesce(v_ambassador.batch_rows, 50)");
    expect(sql).toContain("coalesce(v_ambassador.watchlist_items, 75)");
    expect(sql).toContain("coalesce(v_ambassador.portfolios, 5)");
  });
});
