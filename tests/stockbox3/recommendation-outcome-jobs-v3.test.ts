import { describe, expect, it } from "vitest";
import {
  parseRecommendationOutcomeJobPayloadV3,
  recommendationOutcomeTrackingGateV3,
  RECOMMENDATION_OUTCOME_JOB_KIND_V3,
} from "@/lib/monitoring/recommendation-outcome-jobs-v3";

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
