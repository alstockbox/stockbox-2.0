import { describe, expect, it } from "vitest";
import {
  parseRecommendationOutcomeAuditRowV3,
  parseRecommendationOutcomeJobPayloadV3,
  recommendationOutcomeTrackingGateV3,
  RECOMMENDATION_OUTCOME_JOB_KIND_V3,
} from "@/lib/monitoring/recommendation-outcome-jobs-v3";

function auditRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    observed_at: "2026-09-09T12:00:00.000Z",
    ticker: "MSFT",
    analysis_fingerprint: "fingerprint",
    analysis_archetype: "operating_company",
    model_version: "model-v3",
    recommendation_policy_version: "recommendation-policy-v3",
    v3_rating: "BUY",
    objective_score: 72,
    conviction: 68,
    data_quality: 91,
    model_uncertainty: 14,
    reason_codes: ["QUALITY_EVIDENCE"],
    ...overrides,
  };
}

describe("Recommendation outcome jobs V3", () => {
  it("uses a dedicated durable background job kind", () => {
    expect(RECOMMENDATION_OUTCOME_JOB_KIND_V3).toBe("recommendation_outcome_v3");
  });

  it("accepts only a strict audit/horizon/expectedAt payload", () => {
    expect(parseRecommendationOutcomeJobPayloadV3({
      auditId: "00000000-0000-4000-8000-000000000001",
      horizon: "90d",
      expectedAt: "2026-12-01T12:00:00.000Z",
    })).toEqual({
      auditId: "00000000-0000-4000-8000-000000000001",
      horizon: "90d",
      expectedAt: "2026-12-01T12:00:00.000Z",
    });

    expect(parseRecommendationOutcomeJobPayloadV3({ auditId: "x", horizon: "2d", expectedAt: "bad" })).toBeNull();
    expect(parseRecommendationOutcomeJobPayloadV3({ auditId: "", horizon: "30d", expectedAt: "2026-10-01T00:00:00Z" })).toBeNull();
  });

  it("rejects missing, non-finite or out-of-range audit quality evidence instead of inventing defaults", () => {
    for (const field of ["conviction", "data_quality", "model_uncertainty"] as const) {
      expect(parseRecommendationOutcomeAuditRowV3(auditRow({ [field]: null }))).toBeNull();
      expect(parseRecommendationOutcomeAuditRowV3(auditRow({ [field]: Number.NaN }))).toBeNull();
      expect(parseRecommendationOutcomeAuditRowV3(auditRow({ [field]: -1 }))).toBeNull();
      expect(parseRecommendationOutcomeAuditRowV3(auditRow({ [field]: 101 }))).toBeNull();
    }
  });

  it("rejects blank durable audit identity from legacy or malformed rows", () => {
    for (const field of ["ticker", "analysis_archetype", "model_version", "recommendation_policy_version"] as const) {
      expect(parseRecommendationOutcomeAuditRowV3(auditRow({ [field]: "   " }))).toBeNull();
    }
  });

  it("canonicalizes outcome audit identity and keeps a blank optional fingerprint missing", () => {
    expect(parseRecommendationOutcomeAuditRowV3(auditRow({
      ticker: " msft ",
      analysis_fingerprint: "   ",
      analysis_archetype: " operating_company ",
      model_version: " model-v3 ",
      recommendation_policy_version: " recommendation-policy-v3 ",
    }))).toMatchObject({
      ticker: "MSFT",
      analysis_fingerprint: null,
      analysis_archetype: "operating_company",
      model_version: "model-v3",
      recommendation_policy_version: "recommendation-policy-v3",
    });
  });

  it("preserves valid audit quality evidence exactly", () => {
    expect(parseRecommendationOutcomeAuditRowV3(auditRow())).toMatchObject({
      conviction: 68,
      data_quality: 91,
      model_uncertainty: 14,
    });
  });

  it("is dark by default and respects both emergency kill switches", () => {
    expect(recommendationOutcomeTrackingGateV3({ recommendationEnabled: false }))
      .toEqual({ allowed: false, reason: "recommendation_v3_disabled" });
    expect(recommendationOutcomeTrackingGateV3({ recommendationEnabled: true, recommendationKilled: true }))
      .toEqual({ allowed: false, reason: "recommendation_engine_killed" });
    expect(recommendationOutcomeTrackingGateV3({ recommendationEnabled: true, backgroundJobsKilled: true }))
      .toEqual({ allowed: false, reason: "background_jobs_killed" });
    expect(recommendationOutcomeTrackingGateV3({ recommendationEnabled: true }))
      .toEqual({ allowed: true });
  });
});