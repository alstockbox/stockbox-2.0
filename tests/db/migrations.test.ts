import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hardeningMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260824103000_harden_rls_auto_enable.sql"),
  "utf8",
);
const normalizedSql = hardeningMigration.replace(/\s+/g, " ").toLowerCase();

describe("database hardening migrations", () => {
  it("revokes public rls_auto_enable execution without dropping auto-RLS triggers", () => {
    expect(normalizedSql).toContain("to_regprocedure('public.rls_auto_enable()') is not null");
    expect(normalizedSql).toContain("revoke execute on function public.rls_auto_enable() from public");
    expect(normalizedSql).toContain("revoke execute on function public.rls_auto_enable() from anon");
    expect(normalizedSql).toContain("revoke execute on function public.rls_auto_enable() from authenticated");
    expect(normalizedSql).toContain("information_schema.routine_privileges");
    expect(normalizedSql).not.toContain("drop event trigger");
    expect(normalizedSql).not.toContain("drop trigger");
    expect(normalizedSql).not.toContain("disable trigger");
  });

  it("adds an index for analysis quota reservations by analysis id", () => {
    expect(normalizedSql).toContain(
      "create index if not exists analysis_quota_reservations_analysis_id_idx on public.analysis_quota_reservations (analysis_id)",
    );
  });
});
