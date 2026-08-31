import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260831150000_release_policy_alignment.sql",
);

describe("release policy database alignment", () => {
  it("ships a migration that aligns the production Pro quota to 70 analyses", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("'{monthlyAnalyses}'");
    expect(sql).toContain("'70'::jsonb");
    expect(sql).toContain("where key = 'premium'");
  });
  it("shows the five-analysis Free introduction in workspace entitlements", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("create or replace function private.workspace_entitlements");
    expect(sql).toContain("v_profile_created_at");
    expect(sql).toContain("interval '30 days'");
    expect(sql).toContain("'{monthlyAnalyses}', '5'::jsonb");
  });

  it("keeps the global affiliate payout threshold at 100 SEK", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("payout_minimum_cents = 10000");
    expect(sql).toContain("set default 10000");
  });
});

describe("release policy ambassador safety", () => {
  it("keeps workspace entitlements fail-closed when an ambassador row is missing", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("if not found then");
    expect(sql).toContain("'configured', false");
    expect(sql).toContain("'monthlyAnalyses', 0");
    expect(sql).toContain("'deepAnalyses', 0");
    expect(sql).not.toContain("coalesce(v_ambassador.monthly_analyses, 100)");
    expect(sql).not.toContain("coalesce(v_ambassador.batch_rows, 50)");
  });
});
