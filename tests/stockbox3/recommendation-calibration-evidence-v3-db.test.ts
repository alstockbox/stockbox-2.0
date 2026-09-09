import { describe, expect, it } from "vitest";
import type { RecommendationCalibrationCandidateV3 } from "@/lib/analysis/recommendation-learning-v3";
import type {
  CalibrationBacktestEvidenceV3,
  CalibrationShadowEvidenceV3,
} from "@/lib/analysis/recommendation-calibration-gates-v3";
import { toRecommendationCalibrationEvidenceRowV3 } from "@/lib/db/recommendation-calibration-v3";

function candidate(): RecommendationCalibrationCandidateV3 {
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
    benchmarkSampleSize: 80,
    hitRate: 0.4,
    meanExcessReturn: -0.03,
    reasons: ["MEAN_EXCESS_RETURN_BELOW_MINUS_2_PERCENT"],
  };
}

const baseline = {
  sampleSize: 40,
  benchmarkSampleSize: 40,
  hitRate: 0.4,
  meanExcessReturn: -0.03,
  integrityFailureRate: 0.01,
  safetyIncidentCount: 0,
};

const variant = {
  sampleSize: 40,
  benchmarkSampleSize: 40,
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
    datasetFingerprint: "sha256:frozen-a",
    frozenDataset: true,
    baseline,
    variant,
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
    datasetFingerprint: "sha256:unseen-a",
    unseenSample: true,
    userVisible: false,
    baseline,
    variant,
    ...overrides,
  };
}

describe("Recommendation calibration V3 evidence persistence mapping", () => {
  it("maps a passing frozen backtest through an explicit objective allowlist", () => {
    const row = toRecommendationCalibrationEvidenceRowV3(
      "11111111-1111-4111-8111-111111111111",
      candidate(),
      backtest(),
    );
    const serialized = JSON.stringify(row);

    expect(row.evidence_kind).toBe("BACKTEST");
    expect(row.frozen_dataset).toBe(true);
    expect(row.unseen_sample).toBeNull();
    expect(row.user_visible).toBe(false);
    expect(row.sample_size).toBe(40);
    expect(row.variant_mean_excess_return).toBe(-0.01);
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("portfolio");
    expect(serialized).not.toContain("personalized");
    expect(serialized).not.toContain("ai_output");
  });

  it("maps passing unseen shadow evidence without user exposure", () => {
    const row = toRecommendationCalibrationEvidenceRowV3(
      "11111111-1111-4111-8111-111111111111",
      candidate(),
      shadow(),
    );

    expect(row.evidence_kind).toBe("SHADOW");
    expect(row.frozen_dataset).toBeNull();
    expect(row.unseen_sample).toBe(true);
    expect(row.user_visible).toBe(false);
  });

  it("refuses evidence that did not pass the domain gate", () => {
    expect(() => toRecommendationCalibrationEvidenceRowV3(
      "11111111-1111-4111-8111-111111111111",
      candidate(),
      backtest({ frozenDataset: false }),
    )).toThrow("CALIBRATION_EVIDENCE_GATE_FAILED");

    expect(() => toRecommendationCalibrationEvidenceRowV3(
      "11111111-1111-4111-8111-111111111111",
      candidate(),
      shadow({ userVisible: true }),
    )).toThrow("CALIBRATION_EVIDENCE_GATE_FAILED");
  });
});
