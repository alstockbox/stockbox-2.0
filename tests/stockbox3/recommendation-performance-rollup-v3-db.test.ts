import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import { RECOMMENDATION_OUTCOME_POLICY_VERSION } from "@/lib/analysis/recommendation-learning-v3";
import type { RecommendationPerformanceRollupV3 } from "@/lib/analysis/recommendation-performance-rollup-v3";
import { toRecommendationPerformanceRollupRowV3 } from "@/lib/db/recommendation-performance-rollups-v3";

function rollup(overrides: Partial<RecommendationPerformanceRollupV3> = {}): RecommendationPerformanceRollupV3 {
  return {
    scope: "SECTOR",
    horizon: "30d",
    rating: "BUY",
    sector: " technology ",
    analysisArchetype: null,
    modelVersion: null,
    recommendationPolicyVersion: null,
    count: 40,
    benchmarkCount: 35,
    directionalCount: 30,
    hitRate: 0.6,
    meanSecurityReturn: 0.08,
    meanExcessReturn: 0.03,
    medianExcessReturn: 0.025,
    ...overrides,
  };
}

describe("Recommendation performance rollup persistence V3", () => {
  it("stamps reproducible policy/window lineage and keeps missing dimensions missing", () => {
    const row = toRecommendationPerformanceRollupRowV3(rollup(), {
      sourceLimit: 5_000,
      dimensionSampleGate: 30,
      evaluatedAt: "2026-09-09T13:30:00.000Z",
    });

    expect(row).toMatchObject({
      scope: "SECTOR",
      horizon: "30d",
      rating: "BUY",
      sector: "technology",
      analysis_archetype: null,
      model_version: null,
      recommendation_policy_version: null,
      outcome_policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
      benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
      source_limit: 5_000,
      dimension_sample_gate: 30,
      sample_count: 40,
      benchmark_count: 35,
      directional_count: 30,
      evaluated_at: "2026-09-09T13:30:00.000Z",
    });
    expect(Object.keys(row)).not.toContain("user_id");
    expect(Object.keys(row)).not.toContain("portfolio_id");
    expect(Object.keys(row)).not.toContain("personalized_score");
  });

  it("normalizes bounded evaluation configuration instead of persisting arbitrary windows", () => {
    const row = toRecommendationPerformanceRollupRowV3(rollup(), {
      sourceLimit: 999_999,
      dimensionSampleGate: 2,
      evaluatedAt: "2026-09-09T13:30:00.000Z",
    });
    expect(row.source_limit).toBe(20_000);
    expect(row.dimension_sample_gate).toBe(20);
  });

  it("defines a private, null-safe, policy-scoped materialized read-model", () => {
    const migration = readFileSync(
      "supabase/migrations/20260909122500_recommendation_v3_performance_rollups.sql",
      "utf8",
    ).toLowerCase();

    expect(migration).toContain("analysis_recommendation_v3_performance_rollups");
    expect(migration).toContain("nulls not distinct");
    expect(migration).toContain("outcome_policy_version");
    expect(migration).toContain("benchmark_policy_version");
    expect(migration).toContain("source_limit");
    expect(migration).toContain("dimension_sample_gate");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.analysis_recommendation_v3_performance_rollups from authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.analysis_recommendation_v3_performance_rollups to service_role");
  });
});
