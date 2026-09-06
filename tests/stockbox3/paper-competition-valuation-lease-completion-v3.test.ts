import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905224000_paper_competition_valuation_lease_completion_v3.sql",
);
const source = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";

describe("Paper Trading V3 valuation lease completion", () => {
  it("adds auditable completion fields without removing the claim cooldown timestamp", () => {
    expect(source).toContain("add column if not exists last_completed_at timestamptz");
    expect(source).toContain("add column if not exists last_evaluation_cutoff timestamptz");
    expect(source).toContain("add column if not exists last_outcome text");
    expect(source).toContain("last_outcome in ('verified', 'unavailable', 'error')");
    expect(source).not.toContain("last_claimed_at = null");
  });

  it("creates a service-role-only security-definer completion RPC", () => {
    expect(source).toContain("create or replace function public.complete_paper_competition_valuation_v3(");
    expect(source).toContain("p_competition_id uuid");
    expect(source).toContain("p_lease_token uuid");
    expect(source).toContain("p_evaluation_cutoff timestamptz");
    expect(source).toContain("p_outcome text");
    expect(source).toContain("security definer");
    expect(source).toContain("set search_path = ''");
    expect(source).toContain("revoke all on function public.complete_paper_competition_valuation_v3(uuid, uuid, timestamptz, text) from public, anon, authenticated");
    expect(source).toContain("grant execute on function public.complete_paper_competition_valuation_v3(uuid, uuid, timestamptz, text) to service_role");
  });

  it("locks the control row and requires the exact current lease token", () => {
    expect(source).toContain("from public.paper_competition_valuation_control_v3");
    expect(source).toContain("where competition_id = p_competition_id");
    expect(source).toContain("for update");
    expect(source).toContain("v_control.lease_token is null");
    expect(source).toContain("v_control.lease_token <> p_lease_token");
    expect(source).toContain("return false");
  });

  it("binds the recorded evaluation cutoff exactly to the DB-owned claim timestamp", () => {
    expect(source).toContain("p_evaluation_cutoff is distinct from v_control.last_claimed_at");
    expect(source).toContain("raise exception 'valuation cutoff does not match claim'");
  });

  it("accepts only the three explicit terminal outcomes", () => {
    expect(source).toContain("v_outcome not in ('verified', 'unavailable', 'error')");
    expect(source).toContain("raise exception 'invalid valuation outcome'");
  });

  it("clears only the active lease while retaining cooldown/audit evidence", () => {
    expect(source).toContain("last_completed_at = v_now");
    expect(source).toContain("last_evaluation_cutoff = p_evaluation_cutoff");
    expect(source).toContain("last_outcome = v_outcome");
    expect(source).toContain("lease_token = null");
    expect(source).toContain("lease_expires_at = null");
    expect(source).toContain("updated_at = v_now");
  });
});
