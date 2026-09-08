import { describe, expect, it } from "vitest";
import type { RecommendationDecisionV3 } from "@/lib/analysis/recommendation-v3";
import { derivePersonalizedRecommendationV3 } from "@/lib/analysis/personalized-recommendation-v3";

function decision(rating: RecommendationDecisionV3["rating"]): RecommendationDecisionV3 {
  return {
    rating,
    objectiveScore: 82,
    userMatchScore: null,
    conviction: 80,
    calibrationStatus: "UNCALIBRATED_V3_BASELINE",
    risk: "HIGH",
    dataQuality: 85,
    modelUncertainty: 20,
    horizon: "medium",
    drivers: [],
    confidenceGate: { passed: true, hardBlocked: false, reasons: [], reasonCodes: [], maximumRating: null },
    rationale: [],
    constraintsApplied: [],
    audit: {
      policyVersion: "stockbox-recommendation-policy-v3.0.0",
      modelVersion: "test",
      analysisDate: null,
      inputFingerprint: null,
      horizon: "medium",
      objectiveScore: 82,
      userMatchScore: null,
      scoreConfidence: 80,
      coverageProfile: "test",
      verifiedCoverage: 0.9,
      retrievalCoverage: 0.9,
      conflictCount: 0,
      stockboxFailureCount: 0,
      recommendationEligible: true,
      reasonCodes: [],
    },
    disclosure: "test",
  };
}

describe("StockBox 3 personalized recommendation overlay", () => {
  it("never mutates the objective general rating", () => {
    const result = derivePersonalizedRecommendationV3(decision("STRONG_BUY"), {
      mode: "personalized",
      profile: { riskPreference: "defensive", horizon: "long", style: "quality" },
      candidate: { risk: 25, quality: 45, growth: 85, valuation: 60, momentum: 85 },
      portfolio: { currentPositionWeight: 0.18, sectorWeight: 0.42, maxPositionWeight: 0.12, maxSectorWeight: 0.3 },
    });

    expect(result.generalRating).toBe("STRONG_BUY");
    expect(result.personalizedRating).not.toBe("STRONG_BUY");
  });

  it("can show the pure StockBox view even when personalized context is available", () => {
    const result = derivePersonalizedRecommendationV3(decision("BUY"), {
      mode: "general",
      profile: { riskPreference: "defensive", horizon: "long", style: "quality" },
      candidate: { risk: 20, quality: 30, growth: 90, valuation: 45, momentum: 90 },
      portfolio: { sectorWeight: 0.5, maxSectorWeight: 0.25 },
    });

    expect(result.displayedRating).toBe("BUY");
    expect(result.generalRating).toBe("BUY");
  });

  it("does not upgrade an objectively negative recommendation because of user preferences", () => {
    const result = derivePersonalizedRecommendationV3(decision("SELL"), {
      mode: "personalized",
      profile: { riskPreference: "aggressive", horizon: "short", style: "growth" },
      candidate: { risk: 40, quality: 60, growth: 95, valuation: 80, momentum: 95 },
    });

    expect(result.generalRating).toBe("SELL");
    expect(result.personalizedRating).toBe("SELL");
  });

  it("penalizes portfolio concentration separately from intrinsic investment quality", () => {
    const unconcentrated = derivePersonalizedRecommendationV3(decision("STRONG_BUY"), {
      mode: "personalized",
      profile: { riskPreference: "balanced", horizon: "long", style: "growth" },
      candidate: { risk: 65, quality: 82, growth: 88, valuation: 70, momentum: 75 },
      portfolio: { currentPositionWeight: 0.02, sectorWeight: 0.12, maxPositionWeight: 0.15, maxSectorWeight: 0.3 },
    });
    const concentrated = derivePersonalizedRecommendationV3(decision("STRONG_BUY"), {
      mode: "personalized",
      profile: { riskPreference: "balanced", horizon: "long", style: "growth" },
      candidate: { risk: 65, quality: 82, growth: 88, valuation: 70, momentum: 75 },
      portfolio: { currentPositionWeight: 0.2, sectorWeight: 0.48, correlatedExposureWeight: 0.65, maxPositionWeight: 0.15, maxSectorWeight: 0.3 },
    });

    expect(concentrated.fitScore).toBeLessThan(unconcentrated.fitScore);
    expect(concentrated.reasons.some((reason) => reason.code === "SECTOR_CONCENTRATION")).toBe(true);
  });
});
