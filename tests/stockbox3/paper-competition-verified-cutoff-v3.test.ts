import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905224100_paper_competition_verified_cutoff_v3.sql",
);
const sql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";

describe("Paper Trading V3 latest verified competition cutoff", () => {
  it("persists a dedicated verified cutoff pointer instead of reusing the last terminal outcome", () => {
    expect(sql).toContain("last_verified_at timestamptz");
    expect(sql).toContain("last_verified_evaluation_cutoff timestamptz");
    expect(sql).toContain("paper_competition_valuation_control_v3_verified_pointer_check");
  });

  it("updates the verified pointer only for a normalized verified completion", () => {
    expect(sql).toContain("v_outcome = 'verified'");
    expect(sql).toContain("last_verified_at = case");
    expect(sql).toContain("last_verified_evaluation_cutoff = case");
    expect(sql).toContain("then v_now");
    expect(sql).toContain("then p_evaluation_cutoff");
    expect(sql).toContain("else last_verified_at");
    expect(sql).toContain("else last_verified_evaluation_cutoff");
  });

  it("keeps exact lease-token and DB-owned-cutoff authority in the replacement completion RPC", () => {
    expect(sql).toContain("v_control.lease_token <> p_lease_token");
    expect(sql).toContain("p_evaluation_cutoff is distinct from v_control.last_claimed_at");
    expect(sql).toContain("where competition_id = p_competition_id");
    expect(sql).toContain("and lease_token = p_lease_token");
  });

  it("keeps completion service-role-only and search-path hardened", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("revoke all on function public.complete_paper_competition_valuation_v3");
    expect(sql).toContain("grant execute on function public.complete_paper_competition_valuation_v3");
    expect(sql).toContain("to service_role");
  });
});
