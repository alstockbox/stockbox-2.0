import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260830215500_effective_workspace_entitlements.sql"),
  "utf8",
).replace(/\s+/g, " ").toLowerCase();

describe("effective workspace entitlement hardening", () => {
  it("exposes one service-role-only effective workspace RPC", () => {
    expect(sql).toContain("create or replace function public.get_effective_workspace_entitlements");
    expect(sql).toContain("select private.workspace_entitlements(p_user_id)");
    expect(sql).toContain("grant execute on function public.get_effective_workspace_entitlements(uuid) to service_role");
  });

  it("fails closed when an ambassador entitlement row is missing", () => {
    expect(sql).toContain("'configured', false");
    expect(sql).toContain("'monthlyanalyses', 0");
    expect(sql).toContain("'batchrows', 0");
    expect(sql).toContain("if not v_configured then");
  });

  it("uses the same effective plan for paid and promotional access", () => {
    expect(sql).toContain("v_plan_key := private.stockbox_effective_plan(p_user_id)");
    expect(sql).toContain("v_workspace := private.workspace_entitlements(p_user_id)");
  });
});
