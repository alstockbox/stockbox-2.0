import { describe, expect, it } from "vitest";
import {
  RECOMMENDATION_OUTCOME_POLICY_VERSION,
  type RecommendationOutcomeV3,
} from "@/lib/analysis/recommendation-learning-v3";
import { evaluateRecommendationPerformanceRollupsV3 } from "@/lib/analysis/recommendation-performance-rollup-v3";

function outcome(index: number, overrides: Partial<RecommendationOutcomeV3> = {}): RecommendationOutcomeV3 {
  return {
    policyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    snapshotId: `snapshot-${index}`,
    ticker: `TEST${index}`,
    rating: "BUY",
    analysisArchetype: "standard",
    modelVersion: "model-v3-a",
    recommendationPolicyVersion: "policy-v3",
    horizon: "30d",
    expectedAt: "2026-10-01T00:00:00.000Z",
    evaluatedAt: "2026-10-01T00:00:00.000Z",
    lagDays: 0,
    entryPrice: 100,
    observedPrice: 105,
    securityReturn: 0.05,
    benchmarkTicker: "^GSPC",
    benchmarkEntryPrice: 100,
    benchmarkObservedPrice: 102,
    benchmarkReturn: 0.02,
    excessReturn: 0.03,
    directionalHit: true,
    conviction: 80,
    dataQuality: 90,
    ...overrides,
  };
}

describe("Recommendation performance rollups V3", () => {
  it("always emits rating + horizon base performance across model lineages", () => {
    const outcomes = [
      ...Array.from({ length: 15 }, (_, index) => outcome(index, { modelVersion: "model-v3-a", excessReturn: 0.04 })),
      ...Array.from({ length: 15 }, (_, index) => outcome(index + 15, { modelVersion: "model-v3-b", excessReturn: -0.02, directionalHit: false })),
    ];

    const rollups = evaluateRecommendationPerformanceRollupsV3(outcomes);
    const base = rollups.find((rollup) => rollup.scope === "BASE");

    expect(base).toMatchObject({
      scope: "BASE",
      horizon: "30d",
      rating: "BUY",
      analysisArchetype: null,
      modelVersion: null,
      recommendationPolicyVersion: null,
      count: 30,
      benchmarkCount: 30,
      directionalCount: 30,
      hitRate: 0.5,
    });
    expect(base?.meanExcessReturn).toBeCloseTo(0.01, 8);
    expect(base?.medianExcessReturn).toBeCloseTo(0.01, 8);
  });

  it("does not expose under-sampled archetype or model-lineage slices", () => {
    const outcomes = [
      ...Array.from({ length: 12 }, (_, index) => outcome(index, { analysisArchetype: "standard", modelVersion: "model-v3-a" })),
      ...Array.from({ length: 12 }, (_, index) => outcome(index + 12, { analysisArchetype: "software_growth", modelVersion: "model-v3-b" })),
    ];

    const rollups = evaluateRecommendationPerformanceRollupsV3(outcomes, {
      minimumDimensionBenchmarkSample: 20,
    });

    expect(rollups.filter((rollup) => rollup.scope === "BASE")).toHaveLength(1);
    expect(rollups.filter((rollup) => rollup.scope === "ANALYSIS_ARCHETYPE")).toHaveLength(0);
    expect(rollups.filter((rollup) => rollup.scope === "MODEL_LINEAGE")).toHaveLength(0);
  });

  it("emits richer verified dimensions after their benchmark sample gate is met", () => {
    const outcomes = Array.from({ length: 20 }, (_, index) => outcome(index, {
      analysisArchetype: "software_growth",
      modelVersion: "model-v3-growth",
      recommendationPolicyVersion: "policy-v3-growth",
    }));

    const rollups = evaluateRecommendationPerformanceRollupsV3(outcomes, {
      minimumDimensionBenchmarkSample: 20,
    });

    expect(rollups.find((rollup) => rollup.scope === "ANALYSIS_ARCHETYPE")).toMatchObject({
      analysisArchetype: "software_growth",
      count: 20,
      benchmarkCount: 20,
    });
    expect(rollups.find((rollup) => rollup.scope === "MODEL_LINEAGE")).toMatchObject({
      analysisArchetype: "software_growth",
      modelVersion: "model-v3-growth",
      recommendationPolicyVersion: "policy-v3-growth",
      count: 20,
      benchmarkCount: 20,
    });
  });

  it("keeps missing benchmark data missing and excludes it from dimensional evidence gates", () => {
    const outcomes = Array.from({ length: 30 }, (_, index) => outcome(index, {
      benchmarkTicker: null,
      benchmarkEntryPrice: null,
      benchmarkObservedPrice: null,
      benchmarkReturn: null,
      excessReturn: null,
      directionalHit: null,
    }));

    const rollups = evaluateRecommendationPerformanceRollupsV3(outcomes, {
      minimumDimensionBenchmarkSample: 20,
    });
    const base = rollups.find((rollup) => rollup.scope === "BASE");

    expect(base?.count).toBe(30);
    expect(base?.benchmarkCount).toBe(0);
    expect(base?.meanExcessReturn).toBeNull();
    expect(base?.medianExcessReturn).toBeNull();
    expect(base?.hitRate).toBeNull();
    expect(rollups.filter((rollup) => rollup.scope !== "BASE")).toHaveLength(0);
  });
});
