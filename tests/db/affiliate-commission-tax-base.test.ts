import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("affiliate commission tax base migration", () => {
  it("stores gross and commissionable pre-tax amounts separately", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const sql = readdirSync(dir).sort().map((name) => readFileSync(join(dir, name), "utf8")).join("\n");
    expect(sql).toContain("commissionable_amount_cents");
    expect(sql).toContain("p_commissionable_amount_cents");
    expect(sql).toContain("p_commissionable_amount_cents::numeric * v_affiliate.commission_basis_points");
  });
});
