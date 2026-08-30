import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("affiliate release economics", () => {
  it("uses twenty percent as the minimum active affiliate commission", () => {
    const path = join(root, "supabase/migrations/20260830212500_affiliate_release_economics.sql");
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, "utf8").replace(/\s+/g, " ").toLowerCase();
    expect(sql).toContain("greatest(commission_basis_points, 2000)");
    expect(sql).toContain("where status = 'active'");
  });

  it("keeps new ambassadors at twenty percent by default", () => {
    const form = readFileSync(join(root, "src/components/admin/ambassador-create-form.tsx"), "utf8");
    expect(form).toContain('defaultValue="20"');
  });
});