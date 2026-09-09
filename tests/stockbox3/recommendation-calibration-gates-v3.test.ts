import { describe, expect, it } from "vitest";
import type { RecommendationCalibrationCandidateV3 } from "@/lib/analysis/recommendation-learning-v3";
import {
  evaluateCalibrationBacktestEvidenceV3,
  evaluateCalibrationShadowEvidenceV3,
  type CalibrationBacktestEvidenceV3,
  type CalibrationShadowEvidenceV3,
} from "@/lib/analysis/recommendation-calibration-gates-v3";

function candidate(overrides: Partial<RecommendationCalibrationCandidateV3> = {}): RecommendationCalibrationCandidateV3 {
  return {
    policyVersion: "stockbox-recommendation-calibration-v3.0.0",
    candidateId: "candidate-1",
    createdAt: "2026-09-09T10:00:00.000Z",
    stage: "CANDIDATE",
    horizon: "30d",
    rating: "BUY",
    analysisArchetype: "standard",
    modelVersion: "model-v3",
    recommendationPolicyVersion: "recommendation-policy-v3",
    sampleSize: 80,
    benchmarkSampleSize: 75,
    hitRate: 0.4,
    meanExcessReturn: -0.03,
    reasons: ["MEAN_EXCESS_RETURN_BELOW_MINUS_2_PERCENT"],
    ...overrides,
  };
}

const baselineMetrics = {
  sampleSize: 80,
  benchmarkSampleSize: 75,
  hitRate: 0.4,
  meanExcessReturn: -0.03,
  integrityFailureRate: 0.01,
  safetyIncidentCount: 0,
};

const improvedMetrics = {
  sampleSize: 80,
  benchmarkSampleSize: 75,
  hitRate: 0.48,
  meanExcessReturn: -0.01,
  integrityFailureRate: 0.005,
  safetyIncidentCount: 0,
};

function backtest(overrides: Partial<CalibrationBacktestEvidenceV3> = {}): CalibrationBacktestEvidenceV3 {
  return {
    kind: "BACKTEST",
    candidateId: "candidate-1",
    observedAt: "2026-09-09T11:00:00.000Z",
    analysisArchetype: "standard",
    modelVersion: "model-v3",
    recommendationPolicyVersion: "recommendation-policy-v3",
    variantFingerprint: "sha256:variant-a",
    datasetFingerprint: "sha256:frozen-dataset-a",
    frozenDataset: true,
    baseline: baselineMetrics,
    variant: improvedMetrics,
    ...overrides,
  };
}

function shadow(overrides: Partial<CalibrationShadowEvidenceV3> = {}): CalibrationShadowEvidenceV3 {
  return {
    kind: "SHADOW",
    candidateId: "candidate-1",
    observedAt: "2026-09-09T12:00:00.000Z",
    analysisArchetype: "standard",
    modelVersion: "model-v3",
    recommendationPolicyVersion: "recommendation-policy-v3",
    variantFingerprint: "sha256:variant-a",
    datasetFingerprint: "sha256:unseen-shadow-a",
    unseenSample: true,
    userVisible: false,
    baseline: { ...baselineMetrics, sampleSize: 40, benchmarkSampleSize: 40 },
    variant: { ...improvedMetrics, sampleSize: 40, benchmarkSampleSize: 40 },
    ...overrides,
  };
}

describe("Recommendation calibration evidence gates V3", () => {
  it("accepts a frozen backtest only after measurable improvement with clean safety and integrity", () => {
    const result = evaluateCalibrationBacktestEvidenceV3(candidate(), backtest());

    expect(result.passed).toBe(true);
    expect(result.improved).toBe(true);
    expect(result.reasonCodes).toEqual([]);
  });

  it("fails closed on lineage mismatch, mutable datasets, insufficient samples or safety regressions", () => {
    expect(evaluateCalibrationBacktestEvidenceV3(candidate(), backtest({ modelVersion: "other-model" })).passed).toBe(false);
    expect(evaluateCalibrationBacktestEvidenceV3(candidate(), backtest({ frozenDataset: false })).reasonCodes)
      .toContain("BACKTEST_DATASET_NOT_FROZEN");
    expect(evaluateCalibrationBacktestEvidenceV3(candidate(), backtest({
      variant: { ...improvedMetrics, sampleSize: 20, benchmarkSampleSize: 20 },
    })).reasonCodes).toContain("INSUFFICIENT_VARIANT_SAMPLE");
    expect(evaluateCalibrationBacktestEvidenceV3(candidate(), backtest({
      variant: { ...improvedMetrics, safetyIncidentCount: 1 },
    })).reasonCodes).toContain("SAFETY_INCIDENT_DETECTED");
    expect(evaluateCalibrationBacktestEvidenceV3(candidate(), backtest({
      variant: { ...improvedMetrics, integrityFailureRate: 0.02 },
    })).reasonCodes).toContain("INTEGRITY_REGRESSION");
  });

  it("does not call noise an improvement", () => {
    const result = evaluateCalibrationBacktestEvidenceV3(candidate(), backtest({
      variant: {
        ...improvedMetrics,
        meanExcessReturn: -0.027,
        hitRate: 0.41,
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.improved).toBe(false);
    expect(result.reasonCodes).toContain("NO_MATERIAL_PERFORMANCE_IMPROVEMENT");
  });

  it("requires shadow evidence to be unseen and never user-visible", () => {
    const valid = evaluateCalibrationShadowEvidenceV3(candidate(), shadow());
    expect(valid.passed).toBe(true);
    expect(valid.improved).toBe(true);

    expect(evaluateCalibrationShadowEvidenceV3(candidate(), shadow({ unseenSample: false })).reasonCodes)
      .toContain("SHADOW_SAMPLE_NOT_UNSEEN");
    expect(evaluateCalibrationShadowEvidenceV3(candidate(), shadow({ userVisible: true })).reasonCodes)
      .toContain("SHADOW_VARIANT_WAS_USER_VISIBLE");
  });

  it("rejects a shadow result whose variant is materially worse on a protected performance metric", () => {
    const result = evaluateCalibrationShadowEvidenceV3(candidate(), shadow({
      variant: {
        ...improvedMetrics,
        sampleSize: 40,
        benchmarkSampleSize: 40,
        hitRate: 0.34,
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.reasonCodes).toContain("DIRECTIONAL_HIT_RATE_REGRESSION");
  });
});
