import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "supabase/migrations/20260905224900_paper_final_performance_snapshots_v3.sql");
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
const finalPerformancePolicy = fs.readFileSync("src/lib/paper-trading/final-performance-v3.ts", "utf8");
const performanceRepository = fs.readFileSync("src/lib/paper-trading/performance-repository-v3.ts", "utf8");
const standingsRepository = fs.readFileSync("src/lib/paper-trading/standings-repository-v3.ts", "utf8");

describe("Paper Trading V3 final snapshot persistence and standings authority", () => {
  it("adds one explicit final snapshot policy without weakening the active policy pair", () => {
    expect(migration).toContain("stockbox-paper-performance-v3.0.0");
    expect(migration).toContain("VERIFIED_MARK_TO_MARKET");
    expect(migration).toContain("stockbox-paper-final-performance-v3.0.0");
    expect(migration).toContain("VERIFIED_LAST_TRADE_AT_OR_BEFORE_CUTOFF");
    expect(migration).toContain("interval '20 minutes'");
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("interval '30 seconds'");
  });

  it("persists final snapshots through a separate service-role-only RPC", () => {
    expect(migration).toContain("create or replace function public.record_paper_final_performance_snapshot_v3");
    expect(migration).toContain("revoke all on function public.record_paper_final_performance_snapshot_v3");
    expect(migration).toContain("grant execute on function public.record_paper_final_performance_snapshot_v3");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("grant execute on function public.record_paper_final_performance_snapshot_v3(uuid,uuid,text,numeric,numeric,integer,integer,timestamptz,timestamptz) to authenticated");
  });

  it("requires a completed competition account and exact authoritative ends_at for final persistence", () => {
    expect(migration).toContain("account_type = 'competition'");
    expect(migration).toContain("paper_competitions_v3");
    expect(migration).toContain("v_competition_status <> 'completed'");
    expect(migration).toContain("p_evaluated_at <> v_competition_ends_at");
    expect(migration).toContain("v_account_competition_id");
    expect(migration).toContain("p_oldest_quote_observed_at > p_evaluated_at + interval '30 seconds'");
    expect(migration).toContain("p_evaluated_at - p_oldest_quote_observed_at > interval '7 days'");
  });

  it("keeps active snapshot RPC semantics separate from final persistence", () => {
    expect(migration).not.toContain("create or replace function public.record_paper_performance_snapshot_v3");
    expect(performanceRepository).toContain('supabase.rpc("record_paper_performance_snapshot_v3", params)');
    expect(performanceRepository).toContain("PAPER_PERFORMANCE_V3_POLICY_VERSION");
    expect(performanceRepository).toContain('pricingBasis: "VERIFIED_MARK_TO_MARKET"');
  });

  it("adds strict final snapshot mapping and persistence adapters", () => {
    expect(performanceRepository).toContain("mapPaperFinalPerformanceSnapshotV3");
    expect(performanceRepository).toContain("toPaperFinalPerformanceSnapshotRpcParamsV3");
    expect(performanceRepository).toContain("persistVerifiedPaperFinalPerformanceSnapshotV3");
    expect(performanceRepository).toContain("PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION");
    expect(performanceRepository).toContain("PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS");
    expect(performanceRepository).toContain("PAPER_FINAL_PERFORMANCE_V3_PRICING_BASIS");
    expect(finalPerformancePolicy).toContain('PAPER_FINAL_PERFORMANCE_V3_PRICING_BASIS = "VERIFIED_LAST_TRADE_AT_OR_BEFORE_CUTOFF"');
    expect(performanceRepository).toContain('supabase.rpc("record_paper_final_performance_snapshot_v3", params)');
  });

  it("adds a separate final standings entry point that requires completed plus exact endsAt", () => {
    expect(standingsRepository).toContain("export async function loadPaperCompetitionFinalStandingsV3");
    expect(standingsRepository).toContain("loadPaperCompetitionStandingsForPolicyV3");
    expect(standingsRepository).toContain('expectedSnapshotPolicy: "active" | "final"');
    expect(standingsRepository).toContain('expectedSnapshotPolicy === "final"');
    expect(standingsRepository).toContain('competition.status !== "completed"');
    expect(standingsRepository).toContain("Date.parse(competition.endsAt) !== cutoffMs");
  });

  it("selects final snapshots only by exact cutoff, currency and final policy version", () => {
    expect(standingsRepository).toContain("PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION");
    expect(standingsRepository).toContain("mapPaperFinalPerformanceSnapshotV3");
    expect(standingsRepository).toContain('.eq("evaluated_at", evaluationCutoff)');
    expect(standingsRepository).toContain('.eq("base_currency", competition.baseCurrency)');
    expect(standingsRepository).toContain('.eq("policy_version", expectedPolicyVersion)');
    expect(standingsRepository).toContain('.in("account_id", accountIds)');
  });

  it("does not let a browser choose snapshot policy or bypass private-league membership", () => {
    expect(standingsRepository).not.toContain("input.snapshotPolicy");
    expect(standingsRepository).toContain('competition.kind === "private_league"');
    expect(standingsRepository).toContain('viewer.scope !== "member"');
    expect(standingsRepository).toContain('.eq("user_id", viewerUserId)');
    expect(standingsRepository).not.toContain("derivePaperPerformanceV3");
    expect(standingsRepository).not.toContain("fetchYahoo");
  });
});
