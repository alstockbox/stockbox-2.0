import { describe, expect, it } from "vitest";
import { RECOMMENDATION_OUTCOME_POLICY_VERSION } from "@/lib/analysis/recommendation-learning-v3";
import {
  toRecommendationOutcomeV3Row,
  type RecommendationOutcomePersistInputV3,
} from "@/lib/db/recommendation-outcomes-v3";

function input(overrides: Partial<RecommendationOutcomePersistInputV3> = {}): RecommendationOutcomePersistInputV3 {
  return {
    recommendationAuditId: "00000000-0000-4000-8000-000000000001",
    policyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    horizon: "30d",
    expectedAt: "2026-10-09T12:00:00.000Z",
    evaluatedAt: "2026-10-09T12:00:00.000Z",
    lagDays: 0,
    entryObservedAt: "2026-09-09",
    entryPrice: 100,
    observedPrice: 110,
    securityCurrency: "USD",
    securityReturn: 0.1,
    benchmarkTicker: "^GSPC",
    benchmarkEntryObservedAt: "2026-09-09",
    benchmarkEntryPrice: 100,
    benchmarkObservedAt: "2026-10-09",
    benchmarkObservedPrice: 103,
    benchmarkReturn: 0.03,
    excessReturn: 0.07,
    directionalHit: true,
    securityPriceSource: "verified-security-source",
    benchmarkPriceSource: "verified-benchmark-source",
    ...overrides,
  };
}

describe("Recommendation outcome V3 persistence boundary", () => {
  it("rejects invalid lag evidence instead of clamping or truncating it", () => {
    for (const lagDays of [-1, 1.7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => toRecommendationOutcomeV3Row(input({ lagDays }))).toThrow(
        "INVALID_RECOMMENDATION_OUTCOME_LAG_DAYS",
      );
    }
  });

  it("preserves a valid integer lag exactly", () => {
    expect(toRecommendationOutcomeV3Row(input({ lagDays: 2 })).lag_days).toBe(2);
  });
});
