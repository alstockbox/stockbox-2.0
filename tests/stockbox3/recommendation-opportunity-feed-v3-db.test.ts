import { describe, expect, it } from "vitest";
import { recommendationOpportunityAuditFromRowV3 } from "@/lib/db/recommendation-opportunity-feed-v3";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    observed_at: "2026-09-09T08:00:00.000Z",
    ticker: " msft ",
    analysis_archetype: "standard",
    model_version: "model-v3",
    recommendation_policy_version: "policy-v3",
    v3_rating: "BUY",
    objective_score: "78",
    conviction: "82",
    data_quality: "90",
    model_uncertainty: "18",
    reason_codes: ["VALUATION_SUPPORTIVE"],
    verified_coverage: "0.92",
    recommendation_eligible: true,
    recommendation_integrity_eligible: true,
    confidence_gate_passed: true,
    confidence_gate_hard_blocked: false,
    data_integrity_score: "94",
    ...overrides,
  };
}

describe("Recommendation opportunity feed V3 DB parsing", () => {
  it("normalizes private audit rows without introducing user data", () => {
    const parsed = recommendationOpportunityAuditFromRowV3(row());
    expect(parsed).toMatchObject({ ticker: "MSFT", rating: "BUY", objectiveScore: 78, verifiedCoverage: 0.92 });
    expect(JSON.stringify(parsed)).not.toContain("user_id");
    expect(JSON.stringify(parsed)).not.toContain("personalized");
  });

  it("keeps unavailable objective scores as null for lifecycle closure", () => {
    const parsed = recommendationOpportunityAuditFromRowV3(row({
      v3_rating: "UNAVAILABLE",
      objective_score: null,
      recommendation_eligible: false,
      recommendation_integrity_eligible: false,
      confidence_gate_passed: false,
    }));
    expect(parsed?.rating).toBe("UNAVAILABLE");
    expect(parsed?.objectiveScore).toBeNull();
  });

  it("fails closed on malformed identity, rating or integrity fields", () => {
    expect(recommendationOpportunityAuditFromRowV3(row({ id: null }))).toBeNull();
    expect(recommendationOpportunityAuditFromRowV3(row({ v3_rating: "MOON" }))).toBeNull();
    expect(recommendationOpportunityAuditFromRowV3(row({ recommendation_eligible: "yes" }))).toBeNull();
  });
});
