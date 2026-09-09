import { describe, expect, it } from "vitest";
import type { RecommendationCalibrationCandidateV3 } from "@/lib/analysis/recommendation-learning-v3";
import {
  RECOMMENDATION_CALIBRATION_VARIANT_SCHEMA_V3,
  buildRecommendationCalibrationVariantV3,
  type RecommendationCalibrationVariantSpecV3,
} from "@/lib/db/recommendation-calibration-variants-v3";

const candidate: RecommendationCalibrationCandidateV3 = {
  policyVersion: "stockbox-recommendation-calibration-v3.0.0",
  candidateId: "candidate-1",
  createdAt: "2026-09-09T12:00:00.000Z",
  stage: "CANDIDATE",
  horizon: "30d",
  rating: "BUY",
  analysisArchetype: "standard",
  modelVersion: "stockbox-analysis-v3.0.0",
  recommendationPolicyVersion: "stockbox-recommendation-policy-v3.0.0",
  sampleSize: 60,
  benchmarkSampleSize: 60,
  hitRate: 0.4,
  meanExcessReturn: -0.03,
  medianExcessReturn: -0.025,
  reasons: ["MEAN_EXCESS_RETURN_BELOW_MINUS_2_PERCENT"],
};

function spec(changes: RecommendationCalibrationVariantSpecV3["changes"]): RecommendationCalibrationVariantSpecV3 {
  return {
    schemaVersion: RECOMMENDATION_CALIBRATION_VARIANT_SCHEMA_V3,
    baseModelVersion: candidate.modelVersion,
    baseRecommendationPolicyVersion: candidate.recommendationPolicyVersion,
    variantModelVersion: "stockbox-analysis-v3.0.0",
    variantRecommendationPolicyVersion: "stockbox-recommendation-policy-v3.1.0-candidate",
    implementationRef: "git:deadbeef",
    changes,
  };
}

describe("Recommendation calibration variant V3", () => {
  it("produces a stable fingerprint independent of change declaration order", () => {
    const first = buildRecommendationCalibrationVariantV3(candidate, spec([
      { path: "rating.buy.minimumScore", before: 68, after: 70, rationale: "Reduce weak BUY signals." },
      { path: "rating.strongBuy.minimumScore", before: 84, after: 86, rationale: "Preserve stronger separation." },
    ]));
    const reordered = buildRecommendationCalibrationVariantV3(candidate, spec([
      { path: "rating.strongBuy.minimumScore", before: 84, after: 86, rationale: "Preserve stronger separation." },
      { path: "rating.buy.minimumScore", before: 68, after: 70, rationale: "Reduce weak BUY signals." },
    ]));

    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered.fingerprint).toBe(first.fingerprint);
    expect(first.spec.changes.map((change) => change.path)).toEqual([
      "rating.buy.minimumScore",
      "rating.strongBuy.minimumScore",
    ]);
  });

  it("binds the variant to the candidate's exact base lineage", () => {
    expect(() => buildRecommendationCalibrationVariantV3(candidate, {
      ...spec([{ path: "rating.buy.minimumScore", before: 68, after: 70, rationale: "Test." }]),
      baseModelVersion: "different-model",
    })).toThrow("CALIBRATION_VARIANT_LINEAGE_MISMATCH");
  });

  it("requires an explicit version bump and a real non-noop change", () => {
    expect(() => buildRecommendationCalibrationVariantV3(candidate, {
      ...spec([{ path: "rating.buy.minimumScore", before: 68, after: 70, rationale: "Test." }]),
      variantModelVersion: candidate.modelVersion,
      variantRecommendationPolicyVersion: candidate.recommendationPolicyVersion,
    })).toThrow("CALIBRATION_VARIANT_VERSION_BUMP_REQUIRED");

    expect(() => buildRecommendationCalibrationVariantV3(candidate, spec([
      { path: "rating.buy.minimumScore", before: 68, after: 68, rationale: "No-op." },
    ]))).toThrow("CALIBRATION_VARIANT_NOOP_CHANGE");
  });

  it("rejects ambiguous duplicate paths and non-finite numeric values", () => {
    expect(() => buildRecommendationCalibrationVariantV3(candidate, spec([
      { path: "rating.buy.minimumScore", before: 68, after: 70, rationale: "First." },
      { path: "rating.buy.minimumScore", before: 68, after: 71, rationale: "Second." },
    ]))).toThrow("CALIBRATION_VARIANT_DUPLICATE_CHANGE_PATH");

    expect(() => buildRecommendationCalibrationVariantV3(candidate, spec([
      { path: "rating.buy.minimumScore", before: 68, after: Number.NaN, rationale: "Invalid." },
    ]))).toThrow("CALIBRATION_VARIANT_NONFINITE_VALUE");
  });
});
