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

  it("rejects an absolute return that cannot be reproduced from the persisted prices", () => {
    expect(() => toRecommendationOutcomeV3Row(input({ securityReturn: 0.09 }))).toThrow(
      "INVALID_RECOMMENDATION_OUTCOME_SECURITY_RETURN",
    );
  });

  it("rejects partial benchmark evidence instead of manufacturing a coherent row shape", () => {
    expect(() => toRecommendationOutcomeV3Row(input({ benchmarkTicker: null }))).toThrow(
      "INVALID_RECOMMENDATION_OUTCOME_BENCHMARK_EVIDENCE",
    );
  });

  it("rejects benchmark and excess returns that cannot be reproduced from prices", () => {
    expect(() => toRecommendationOutcomeV3Row(input({ benchmarkReturn: 0.04 }))).toThrow(
      "INVALID_RECOMMENDATION_OUTCOME_BENCHMARK_RETURN",
    );
    expect(() => toRecommendationOutcomeV3Row(input({ excessReturn: 0.08 }))).toThrow(
      "INVALID_RECOMMENDATION_OUTCOME_EXCESS_RETURN",
    );
  });

  it("allows fully unbenchmarked evidence without inventing relative performance", () => {
    const row = toRecommendationOutcomeV3Row(input({
      benchmarkTicker: null,
      benchmarkEntryObservedAt: null,
      benchmarkEntryPrice: null,
      benchmarkObservedAt: null,
      benchmarkObservedPrice: null,
      benchmarkReturn: null,
      excessReturn: null,
      directionalHit: null,
      benchmarkPriceSource: null,
    }));

    expect(row).toMatchObject({
      benchmark_ticker: null,
      benchmark_entry_observed_at: null,
      benchmark_entry_price: null,
      benchmark_observed_at: null,
      benchmark_observed_price: null,
      benchmark_return: null,
      excess_return: null,
      directional_hit: null,
      benchmark_price_source: null,
    });
  });

  it("rejects caller-supplied outcome policy lineage that is not the canonical policy", () => {
    expect(() => toRecommendationOutcomeV3Row(input({ policyVersion: "stale-outcome-policy" }))).toThrow(
      "INVALID_RECOMMENDATION_OUTCOME_POLICY_VERSION",
    );
  });

  it("rejects malformed or pre-horizon evaluation timestamps", () => {
    expect(() => toRecommendationOutcomeV3Row(input({ evaluatedAt: "not-a-date" }))).toThrow(
      "INVALID_RECOMMENDATION_OUTCOME_TIMELINE",
    );
    expect(() => toRecommendationOutcomeV3Row(input({ expectedAt: "not-a-date" }))).toThrow(
      "INVALID_RECOMMENDATION_OUTCOME_TIMELINE",
    );
    expect(() => toRecommendationOutcomeV3Row(input({
      expectedAt: "2026-10-09T12:00:00.000Z",
      evaluatedAt: "2026-10-08T12:00:00.000Z",
    }))).toThrow("INVALID_RECOMMENDATION_OUTCOME_TIMELINE");
  });

  it("rejects lag evidence that disagrees with the persisted outcome timeline", () => {
    expect(() => toRecommendationOutcomeV3Row(input({
      expectedAt: "2026-10-09T12:00:00.000Z",
      evaluatedAt: "2026-10-11T12:00:00.000Z",
      lagDays: 0,
    }))).toThrow("INVALID_RECOMMENDATION_OUTCOME_LAG_EVIDENCE");
  });
});
