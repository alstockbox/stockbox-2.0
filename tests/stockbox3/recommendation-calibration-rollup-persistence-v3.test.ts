import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import { RECOMMENDATION_OUTCOME_POLICY_VERSION } from "@/lib/analysis/recommendation-learning-v3";

const mocks = vi.hoisted(() => ({
  outcomeRows: [] as Record<string, unknown>[],
  auditRows: [] as Record<string, unknown>[],
  persistRollups: vi.fn(),
  persistCandidate: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === "analysis_recommendation_v3_outcomes") {
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          order() { return builder; },
          async limit() { return { data: mocks.outcomeRows, error: null }; },
        };
        return builder;
      }
      if (table === "analysis_recommendation_v3_audit") {
        const builder = {
          select() { return builder; },
          async in() { return { data: mocks.auditRows, error: null }; },
        };
        return builder;
      }
      throw new Error(`Unexpected calibration table: ${table}`);
    },
  }),
}));

vi.mock("@/lib/db/recommendation-calibration-v3", () => ({
  persistRecommendationCalibrationCandidateV3: mocks.persistCandidate,
}));

vi.mock("@/lib/db/recommendation-performance-rollups-v3", () => ({
  persistRecommendationPerformanceRollupsV3: mocks.persistRollups,
}));

import { runRecommendationCalibrationEvaluationV3 } from "@/lib/monitoring/recommendation-calibration-evaluation-v3";

const AUDIT_ID = "00000000-0000-4000-8000-000000000001";
const EVALUATED_AT = "2026-09-09T13:35:00.000Z";

function outcomeRow() {
  return {
    recommendation_audit_id: AUDIT_ID,
    policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
    horizon: "30d",
    expected_at: "2026-09-09T12:00:00.000Z",
    evaluated_at: "2026-09-09T12:00:00.000Z",
    lag_days: 0,
    entry_price: 100,
    observed_price: 95,
    security_return: -0.05,
    benchmark_ticker: "^GSPC",
    benchmark_entry_price: 100,
    benchmark_observed_price: 100,
    benchmark_return: 0,
    excess_return: -0.05,
    directional_hit: false,
  };
}

function auditRow() {
  return {
    id: AUDIT_ID,
    ticker: "MSFT",
    analysis_archetype: "standard",
    sector: "technology",
    model_version: "stockbox-analysis-v3-test",
    recommendation_policy_version: "stockbox-recommendation-policy-v3.0.0",
    v3_rating: "BUY",
    conviction: 82,
    data_quality: 91,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FEATURE_RECOMMENDATIONV3", "true");
  vi.stubEnv("KILL_SWITCH_RECOMMENDATIONENGINE", "false");
  vi.stubEnv("KILL_SWITCH_BACKGROUNDJOBS", "false");
  mocks.outcomeRows = Array.from({ length: 30 }, () => outcomeRow());
  mocks.auditRows = [auditRow()];
  mocks.persistRollups.mockResolvedValue({ ok: true, configured: true, persisted: 4 });
  mocks.persistCandidate.mockResolvedValue({
    ok: true,
    configured: true,
    created: true,
    refreshed: false,
    stage: "CANDIDATE",
  });
});

describe("Recommendation calibration rollup persistence V3", () => {
  it("materializes rollups with the exact evaluation window and sample gate", async () => {
    const result = await runRecommendationCalibrationEvaluationV3({
      limit: 100,
      minimumBenchmarkSample: 30,
      now: new Date(EVALUATED_AT),
    });

    expect(result.performanceRollups).toBe(4);
    expect(mocks.persistRollups).toHaveBeenCalledTimes(1);
    expect(mocks.persistRollups).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ scope: "BASE", horizon: "30d", rating: "BUY" }),
        expect.objectContaining({ scope: "SECTOR", sector: "technology" }),
        expect.objectContaining({ scope: "ANALYSIS_ARCHETYPE", analysisArchetype: "standard" }),
        expect.objectContaining({ scope: "MODEL_LINEAGE", modelVersion: "stockbox-analysis-v3-test" }),
      ]),
      {
        sourceLimit: 100,
        dimensionSampleGate: 30,
        evaluatedAt: EVALUATED_AT,
      },
    );
    expect(mocks.persistCandidate).toHaveBeenCalledTimes(1);
    expect((result as unknown as { performanceRollupsPersisted?: number }).performanceRollupsPersisted).toBe(4);
    expect(result.failed).toBe(0);
  });

  it("keeps candidate persistence alive while surfacing rollup storage failure", async () => {
    mocks.persistRollups.mockResolvedValue({
      ok: false,
      configured: true,
      persisted: 0,
      error: "ROLLUP_STORE_UNAVAILABLE",
    });

    const result = await runRecommendationCalibrationEvaluationV3({
      limit: 100,
      minimumBenchmarkSample: 30,
      now: new Date(EVALUATED_AT),
    });

    expect(mocks.persistCandidate).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    expect((result as unknown as { performanceRollupPersistenceFailed?: number }).performanceRollupPersistenceFailed).toBe(1);
  });
});
