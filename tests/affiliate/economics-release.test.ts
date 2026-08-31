import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("affiliate release economics", () => {
  it("removes any global commission floor so each affiliate can be configured individually", () => {
    const path = join(root, "supabase/migrations/20260831153000_affiliate_commission_policy.sql");
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, "utf8").replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain("commission_basis_points set default 0");
    expect(sql).not.toContain("greatest(commission_basis_points");
  });

  it("requires admin to choose the commission for a new ambassador", () => {
    const form = readFileSync(join(root, "src/components/admin/ambassador-create-form.tsx"), "utf8");
    expect(form).toContain('name="commissionPercent"');
    expect(form).toContain('required');
    expect(form).not.toContain('defaultValue="20"');
  });
});
