import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905224500_paper_competition_lifecycle_v3.sql",
);
const repositoryPath = path.join(
  process.cwd(),
  "src/lib/paper-trading/competition-lifecycle-repository-v3.ts",
);
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
const repository = fs.existsSync(repositoryPath) ? fs.readFileSync(repositoryPath, "utf8") : "";

describe("Paper Trading V3 competition lifecycle activation authority", () => {
  it("adds a service-role-only DB-owned open-to-active reconciliation RPC", () => {
    expect(migration).toContain("create or replace function public.reconcile_paper_competition_lifecycle_v3()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("v_now timestamptz := clock_timestamp()");
    expect(migration).toContain("revoke all on function public.reconcile_paper_competition_lifecycle_v3() from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.reconcile_paper_competition_lifecycle_v3() to service_role");
  });

  it("activates only open competitions whose official window has started but not ended", () => {
    expect(migration).toContain("set status = 'active'");
    expect(migration).toContain("updated_at = v_now");
    expect(migration).toContain("where status = 'open'");
    expect(migration).toContain("starts_at <= v_now");
    expect(migration).toContain("ends_at >= v_now");
  });

  it("does not fabricate completion or accept caller-controlled time/limits", () => {
    expect(migration).not.toContain("set status = 'completed'");
    expect(migration).not.toContain("p_now");
    expect(migration).not.toContain("p_limit");
    expect(migration).not.toContain("p_status");
  });

  it("returns the exact number of rows activated by the DB update", () => {
    expect(migration).toContain("get diagnostics v_activated = row_count");
    expect(migration).toContain("return v_activated");
  });

  it("exposes a strict server repository that calls the no-argument RPC and fails closed", () => {
    expect(repository).toContain("export async function reconcilePaperCompetitionLifecycleV3");
    expect(repository).toContain("createAdminClient()");
    expect(repository).toContain('.rpc("reconcile_paper_competition_lifecycle_v3")');
    expect(repository).not.toContain("p_now");
    expect(repository).not.toContain("p_limit");
    expect(repository).toContain("PAPER_COMPETITION_LIFECYCLE_INVALID_RESULT");
    expect(repository).toContain("Number.isInteger(activated)");
    expect(repository).toContain("activated >= 0");
  });
});
