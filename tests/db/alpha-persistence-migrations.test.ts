import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const predictionMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260910013000_alpha_breakout_intelligence.sql",
);
const universeMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260910014000_alpha_universe_scanner.sql",
);

function normalized(path: string): string {
  return readFileSync(path, "utf8").replace(/\s+/g, " ").toLowerCase();
}

describe("Alpha persistence migrations", () => {
  it("uses forward-only migration timestamps after the existing September 8 migration chain", () => {
    expect(existsSync(predictionMigrationPath)).toBe(true);
    expect(existsSync(universeMigrationPath)).toBe(true);
  });

  it("creates a service-role-only point-in-time prediction and outcome ledger", () => {
    expect(existsSync(predictionMigrationPath)).toBe(true);
    if (!existsSync(predictionMigrationPath)) return;
    const sql = normalized(predictionMigrationPath);

    expect(sql).toContain("create table public.alpha_predictions");
    expect(sql).toContain("create table public.alpha_prediction_outcomes");
    expect(sql).toContain("unique (analysis_id, model_version)");
    expect(sql).toContain("unique (prediction_id, horizon_days)");
    expect(sql).toContain("alter table public.alpha_predictions enable row level security");
    expect(sql).toContain("alter table public.alpha_prediction_outcomes enable row level security");
    expect(sql).toContain("revoke all on public.alpha_predictions from anon, authenticated");
    expect(sql).toContain("revoke all on public.alpha_prediction_outcomes from anon, authenticated");
  });

  it("keeps scanner predictions independent from customer analyses and preserves retry state", () => {
    expect(existsSync(universeMigrationPath)).toBe(true);
    if (!existsSync(universeMigrationPath)) return;
    const sql = normalized(universeMigrationPath);

    expect(sql).toContain("create table public.alpha_universe_securities");
    expect(sql).toContain("create table public.alpha_universe_memberships");
    expect(sql).toContain("create table public.alpha_scan_runs");
    expect(sql).toContain("scan_failure_count integer not null default 0");
    expect(sql).toContain("origin_type text not null default 'analysis'");
    expect(sql).toContain("origin_type = 'universe' and analysis_id is null and universe_security_id is not null");
    expect(sql).toContain("alpha_predictions_universe_model_asof_uidx");
    expect(sql).toContain("alter table public.alpha_universe_securities enable row level security");
    expect(sql).toContain("revoke all on public.alpha_universe_securities from anon, authenticated");
  });
});