import { describe, expect, it } from "vitest";
import {
  toRecommendationOutcomeV3Row,
  type RecommendationOutcomePersistInputV3,
} from "@/lib/db/recommendation-outcomes-v3";

function input(overrides: Partial<RecommendationOutcomePersistInputV3> = {}): RecommendationOutcomePersistInputV3 {
  return {
    recommendationAuditId: "00000000-0000-4000-8000-000000000001",
    policyVersion: "stockbox-recommendation-outcomes-v3.0.0",
    horizon: "30d",
    expectedAt: "2026-10-01T12:00:00.000Z",
    evaluatedAt: "2026-10-01T12:03:00.000Z",
    lagDays: 0,
    entryObservedAt: "2026-08-31",
    entryPrice: 100,
    observedPrice: 110,
    securityCurrency: "USD",
    securityReturn: 0.1,
    benchmarkTicker: "SPY",
    benchmarkEntryObservedAt: "2026-08-31",
    benchmarkEntryPrice: 100,
    benchmarkObservedAt: "2026-10-01",
    benchmarkObservedPrice: 104,
    benchmarkReturn: 0.04,
    excessReturn: 0.06,
    directionalHit: true,
    securityPriceSource: "market-history",
    benchmarkPriceSource: "market-history",
    ...overrides,
  };
}

describe("Recommendation V3 outcome persistence", () => {
  it("maps only objective market outcome fields", () => {
    const row = toRecommendationOutcomeV3Row(input(), "2026-10-01T12:04:00.000Z");

    expect(row).toEqual({
      recommendation_audit_id: "00000000-0000-4000-8000-000000000001",
      policy_version: "stockbox-recommendation-outcomes-v3.0.0",
      horizon: "30d",
      expected_at: "2026-10-01T12:00:00.000Z",
      evaluated_at: "2026-10-01T12:03:00.000Z",
      lag_days: 0,
      entry_observed_at: "2026-08-31",
      entry_price: 100,
      observed_price: 110,
      security_currency: "USD",
      security_return: 0.1,
      benchmark_ticker: "SPY",
      benchmark_entry_observed_at: "2026-08-31",
      benchmark_entry_price: 100,
      benchmark_observed_at: "2026-10-01",
      benchmark_observed_price: 104,
      benchmark_return: 0.04,
      excess_return: 0.06,
      directional_hit: true,
      security_price_source: "market-history",
      benchmark_price_source: "market-history",
      updated_at: "2026-10-01T12:04:00.000Z",
    });

    const keys = Object.keys(row);
    expect(keys).not.toContain("user_id");
    expect(keys).not.toContain("personalized_score");
    expect(keys).not.toContain("user_match");
    expect(keys).not.toContain("ai_output");
  });

  it("normalizes identifiers and benchmark ticker without inventing missing benchmark data", () => {
    const row = toRecommendationOutcomeV3Row(input({
      benchmarkTicker: "  spy ",
      benchmarkEntryObservedAt: null,
      benchmarkEntryPrice: null,
      benchmarkObservedAt: null,
      benchmarkObservedPrice: null,
      benchmarkReturn: null,
      excessReturn: null,
      directionalHit: null,
      benchmarkPriceSource: null,
    }));

    expect(row.benchmark_ticker).toBe("SPY");
    expect(row.benchmark_entry_observed_at).toBeNull();
    expect(row.benchmark_entry_price).toBeNull();
    expect(row.benchmark_observed_at).toBeNull();
    expect(row.benchmark_observed_price).toBeNull();
    expect(row.benchmark_return).toBeNull();
    expect(row.excess_return).toBeNull();
    expect(row.directional_hit).toBeNull();
    expect(row.benchmark_price_source).toBeNull();
  });
});
