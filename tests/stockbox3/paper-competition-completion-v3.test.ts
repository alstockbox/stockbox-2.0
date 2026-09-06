import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905224600_paper_competition_completion_v3.sql",
);
const repositoryPath = path.join(
  process.cwd(),
  "src/lib/paper-trading/competition-completion-repository-v3.ts",
);
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
const repository = fs.existsSync(repositoryPath) ? fs.readFileSync(repositoryPath, "utf8") : "";

describe("Paper Trading V3 competition completion lifecycle authority", () => {
  it("adds a service-role-only DB-owned active-to-completed reconciliation RPC", () => {
    expect(migration).toContain("create or replace function public.complete_due_paper_competitions_v3()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("v_now timestamptz := clock_timestamp()");
    expect(migration).toContain("revoke all on function public.complete_due_paper_competitions_v3() from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.complete_due_paper_competitions_v3() to service_role");
  });

  it("completes only active competitions whose official window has actually ended", () => {
    expect(migration).toContain("set status = 'completed'");
    expect(migration).toContain("updated_at = v_now");
    expect(migration).toContain("where status = 'active'");
    expect(migration).toContain("ends_at < v_now");
  });

  it("keeps lifecycle completion independent from final valuation availability and caller authority", () => {
    expect(migration).not.toContain("paper_competition_valuation_control_v3");
    expect(migration).not.toContain("paper_performance_snapshots_v3");
    expect(migration).not.toContain("last_verified_evaluation_cutoff");
    expect(migration).not.toContain("p_now");
    expect(migration).not.toContain("p_limit");
    expect(migration).not.toContain("p_cutoff");
  });

  it("returns the exact number of competitions completed by the DB update", () => {
    expect(migration).toContain("get diagnostics v_completed = row_count");
    expect(migration).toContain("return v_completed");
  });

  it("exposes a strict server repository that calls only the no-argument completion RPC", () => {
    expect(repository).toContain("export async function completeDuePaperCompetitionsV3");
    expect(repository).toContain("createAdminClient()");
    expect(repository).toContain('.rpc("complete_due_paper_competitions_v3")');
    expect(repository).not.toContain("p_now");
    expect(repository).not.toContain("p_limit");
    expect(repository).not.toContain("p_cutoff");
    expect(repository).toContain("PAPER_COMPETITION_COMPLETION_INVALID_RESULT");
    expect(repository).toContain("Number.isInteger(completed)");
    expect(repository).toContain("completed >= 0");
  });
});
