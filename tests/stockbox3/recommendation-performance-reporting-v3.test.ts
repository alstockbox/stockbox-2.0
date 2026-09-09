import { describe, expect, it } from "vitest";
import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import { RECOMMENDATION_OUTCOME_POLICY_VERSION } from "@/lib/analysis/recommendation-learning-v3";
import { selectRecommendationPerformanceRollupV3 } from "@/lib/analysis/recommendation-performance-reporting-v3";
import type {
  RecommendationPerformanceRollupReadRowV3,
  RecommendationPerformanceRollupSnapshotV3,
} from "@/lib/db/recommendation-performance-rollups-v3";

function row(
  overrides: Partial<RecommendationPerformanceRollupReadRowV3> = {},
): RecommendationPerformanceRollupReadRowV3 {
  return {
    scope: "BASE",
    horizon: "30d",
    rating: "BUY",
    sector: null,
    analysisArchetype: null,
    modelVersion: null,
    recommendationPolicyVersion: null,
    sampleCount: 40,
    benchmarkCount: 35,
    directionalCount: 30,
    hitRate: 0.6,
    meanSecurityReturn: 0.08,
    meanExcessReturn: 0.03,
    medianExcessReturn: 0.02,
    evaluatedAt: "2026-09-09T15:00:00.000Z",
    ...overrides,
  };
}

function snapshot(
  rollups: RecommendationPerformanceRollupReadRowV3[],
): RecommendationPerformanceRollupSnapshotV3 {
  return {
    evaluatedAt: "2026-09-09T15:00:00.000Z",
    outcomePolicyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    benchmarkPolicyVersion: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
    sourceLimit: 5_000,
    dimensionSampleGate: 30,
    rollups,
  };
}

describe("Recommendation performance reporting selection V3", () => {
  it("selects the exact requested slice and carries reproducibility lineage", () => {
    const sector = row({
      scope: "SECTOR",
      sector: "Industrials",
      sampleCount: 31,
      medianExcessReturn: null,
    });
    const result = selectRecommendationPerformanceRollupV3(snapshot([row(), sector]), {
      scope: "SECTOR",
      horizon: "30d",
      rating: "BUY",
      sector: "Industrials",
    });

    expect(result).toEqual({
      ok: true,
      lineage: {
        evaluatedAt: "2026-09-09T15:00:00.000Z",
        outcomePolicyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
        benchmarkPolicyVersion: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
        sourceLimit: 5_000,
        dimensionSampleGate: 30,
      },
      rollup: sector,
    });
  });

  it("never silently falls back to BASE when a gated dimension is absent", () => {
    const result = selectRecommendationPerformanceRollupV3(snapshot([row()]), {
      scope: "SECTOR",
      horizon: "30d",
      rating: "BUY",
      sector: "Technology",
    });

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("requires the full model lineage including analysis archetype", () => {
    const model = row({
      scope: "MODEL_LINEAGE",
      analysisArchetype: "ETF",
      modelVersion: "recommendation-v3-etf-specialist-v1",
      recommendationPolicyVersion: "recommendation-v3-etf-specialist-policy-v1",
    });
    const result = selectRecommendationPerformanceRollupV3(snapshot([model]), {
      scope: "MODEL_LINEAGE",
      horizon: "30d",
      rating: "BUY",
      analysisArchetype: "ETF",
      modelVersion: "recommendation-v3-etf-specialist-v1",
      recommendationPolicyVersion: "recommendation-v3-etf-specialist-policy-v1",
    });

    expect(result).toMatchObject({ ok: true, rollup: model });
  });

  it("rejects structurally mismatched dimensions instead of guessing intent", () => {
    const result = selectRecommendationPerformanceRollupV3(snapshot([row()]), {
      scope: "BASE",
      horizon: "30d",
      rating: "BUY",
      sector: "Technology",
    } as never);

    expect(result).toEqual({ ok: false, reason: "INVALID_QUERY" });
  });

  it("rejects unknown horizons instead of treating malformed input as missing evidence", () => {
    const result = selectRecommendationPerformanceRollupV3(snapshot([row()]), {
      scope: "BASE",
      horizon: "45d",
      rating: "BUY",
    } as never);

    expect(result).toEqual({ ok: false, reason: "INVALID_QUERY" });
  });

  it("rejects unknown ratings instead of treating malformed input as missing evidence", () => {
    const result = selectRecommendationPerformanceRollupV3(snapshot([row()]), {
      scope: "BASE",
      horizon: "30d",
      rating: "ACCUMULATE",
    } as never);

    expect(result).toEqual({ ok: false, reason: "INVALID_QUERY" });
  });

  it("rejects non-object runtime input without throwing", () => {
    const result = selectRecommendationPerformanceRollupV3(snapshot([row()]), null as never);
    expect(result).toEqual({ ok: false, reason: "INVALID_QUERY" });
  });

  it("preserves null metrics as missing evidence", () => {
    const base = row({ hitRate: null, meanSecurityReturn: null, meanExcessReturn: null, medianExcessReturn: null });
    const result = selectRecommendationPerformanceRollupV3(snapshot([base]), {
      scope: "BASE",
      horizon: "30d",
      rating: "BUY",
    });

    expect(result).toMatchObject({
      ok: true,
      rollup: {
        hitRate: null,
        meanSecurityReturn: null,
        meanExcessReturn: null,
        medianExcessReturn: null,
      },
    });
  });
});
