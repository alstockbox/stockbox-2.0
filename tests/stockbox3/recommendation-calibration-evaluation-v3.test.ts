import { describe, expect, it } from "vitest";
import { recommendationOutcomeFromPersistenceV3 } from "@/lib/monitoring/recommendation-calibration-evaluation-v3";

const lineage = {
  id: "00000000-0000-4000-8000-000000000001",
  ticker: "MSFT",
  analysisArchetype: "standard",
  modelVersion: "stockbox-analysis-v3-test",
  recommendationPolicyVersion: "stockbox-recommendation-policy-v3.0.0",
  rating: "BUY" as const,
  conviction: 82,
  dataQuality: 91,
};

function persisted(overrides: Record<string, unknown> = {}) {
  return {
    recommendation_audit_id: lineage.id,
    policy_version: "stockbox-recommendation-outcomes-v3.0.0",
    horizon: "30d",
    expected_at: "2026-10-01T12:00:00.000Z",
    evaluated_at: "2026-10-01T12:00:00.000Z",
    lag_days: 0,
    entry_price: "100",
    observed_price: "110",
    security_return: "0.10",
    benchmark_ticker: "^GSPC",
    benchmark_entry_price: "100",
    benchmark_observed_price: "103",
    benchmark_return: "0.03",
    excess_return: "0.07",
    directional_hit: true,
    ...overrides,
  };
}

describe("Recommendation calibration evaluation V3", () => {
  it("reconstructs benchmarked outcomes with their exact model lineage", () => {
    const result = recommendationOutcomeFromPersistenceV3(persisted(), lineage);

    expect(result).not.toBeNull();
    expect(result?.analysisArchetype).toBe("standard");
    expect(result?.modelVersion).toBe("stockbox-analysis-v3-test");
    expect(result?.recommendationPolicyVersion).toBe("stockbox-recommendation-policy-v3.0.0");
    expect(result?.rating).toBe("BUY");
    expect(result?.securityReturn).toBeCloseTo(0.1, 8);
    expect(result?.excessReturn).toBeCloseTo(0.07, 8);
    expect(result?.directionalHit).toBe(true);
  });

  it("accepts unbenchmarked outcomes without inventing benchmark performance", () => {
    const result = recommendationOutcomeFromPersistenceV3(persisted({
      benchmark_ticker: null,
      benchmark_entry_price: null,
      benchmark_observed_price: null,
      benchmark_return: null,
      excess_return: null,
      directional_hit: null,
    }), lineage);

    expect(result?.benchmarkTicker).toBeNull();
    expect(result?.benchmarkReturn).toBeNull();
    expect(result?.excessReturn).toBeNull();
    expect(result?.directionalHit).toBeNull();
  });

  it("fails closed for stale policy versions or malformed price evidence", () => {
    expect(recommendationOutcomeFromPersistenceV3(persisted({ policy_version: "old-policy" }), lineage)).toBeNull();
    expect(recommendationOutcomeFromPersistenceV3(persisted({ entry_price: "not-a-number" }), lineage)).toBeNull();
    expect(recommendationOutcomeFromPersistenceV3(persisted({ observed_price: 0 }), lineage)).toBeNull();
  });
});
