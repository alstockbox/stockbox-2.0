import { describe, expect, it } from "vitest";
import {
  deriveRecommendationV3,
  recommendationV3Label,
} from "@/lib/analysis/recommendation-v3";
import type { CoverageAssessment } from "@/lib/analysis/coverage-v3";
import type { ScoreDimension, ScoreDimensionKey, ScoreResult } from "@/lib/analysis/types";

const dimensionKeys: ScoreDimensionKey[] = [
  "growth",
  "profitability",
  "financialHealth",
  "valuation",
  "cashFlow",
  "earningsQuality",
  "quality",
  "momentum",
  "risk",
];

function scoreFixture(overrides: Partial<ScoreResult> = {}): ScoreResult {
  const dimensions = Object.fromEntries(
    dimensionKeys.map((key) => [
      key,
      {
        key,
        label: key,
        score: key === "valuation" ? 90 : key === "risk" ? 70 : 80,
        weight: key === "valuation" ? 0.2 : 0.1,
        coverage: 1,
        contributors: [],
      } satisfies ScoreDimension,
    ]),
  ) as Record<ScoreDimensionKey, ScoreDimension>;

  return {
    stockBoxScore: 86,
    personalizedScore: 10,
    investmentProfile: "balanced",
    sector: "technology",
    analysisArchetype: "standard",
    confidence: 90,
    confidenceBreakdown: {} as ScoreResult["confidenceBreakdown"],
    dataCoverage: 1,
    dimensions,
    shortTermScore: 75,
    longTermScore: 90,
    ...overrides,
  } as ScoreResult;
}

function coverageFixture(overrides: Partial<CoverageAssessment> = {}): CoverageAssessment {
  return {
    policyVersion: "stockbox-coverage-policy-v3.0.0",
    profileId: "standard",
    profileLabel: "Standard operating company",
    verifiedCoverage: 1,
    retrievalCoverage: 1,
    disclosureCoverage: 1,
    dataPoints: [],
    blockingIssues: [],
    stockboxFailureCount: 0,
    sourceUnavailableCount: 0,
    companyDisclosureGapCount: 0,
    conflictCount: 0,
    verifiedCount: 10,
    conditionalMetricCount: 0,
    recommendationEligible: true,
    fairness: {
      stockboxFailuresPenalizeCompanyQuality: false,
      sourceUnavailablePenalizesCompanyQuality: false,
      dataConflictsPenalizeCompanyQuality: false,
      confirmedNonReportingMayCreateDisclosureConcern: true,
    },
    ...overrides,
  } as CoverageAssessment;
}

describe("Recommendation Engine V3", () => {
  it("never lets personalized score change the objective recommendation", () => {
    const coverage = coverageFixture();
    const lowMatch = deriveRecommendationV3(scoreFixture({ personalizedScore: 5 }), coverage);
    const highMatch = deriveRecommendationV3(scoreFixture({ personalizedScore: 99 }), coverage);

    expect(lowMatch.objectiveScore).toBe(86);
    expect(highMatch.objectiveScore).toBe(86);
    expect(lowMatch.rating).toBe("STRONG_BUY");
    expect(highMatch.rating).toBe("STRONG_BUY");
    expect(lowMatch.userMatchScore).toBe(5);
    expect(highMatch.userMatchScore).toBe(99);
  });

  it("limits a directional recommendation when StockBox itself has a retrieval failure", () => {
    const decision = deriveRecommendationV3(
      scoreFixture({ stockBoxScore: 92 }),
      coverageFixture({
        verifiedCoverage: 0.9,
        retrievalCoverage: 0.9,
        recommendationEligible: false,
        stockboxFailureCount: 1,
      }),
    );

    expect(decision.rating).toBe("WAIT");
    expect(decision.confidenceGate.reasonCodes).toContain("STOCKBOX_RETRIEVAL_FAILURE");
    expect(decision.audit.stockboxFailureCount).toBe(1);
  });

  it("returns unavailable rather than inventing confidence when critical coverage is too low", () => {
    const decision = deriveRecommendationV3(
      scoreFixture({ stockBoxScore: 95 }),
      coverageFixture({
        verifiedCoverage: 0.4,
        retrievalCoverage: 0.5,
        recommendationEligible: false,
      }),
    );

    expect(decision.rating).toBe("UNAVAILABLE");
    expect(decision.conviction).toBe(0);
    expect(decision.confidenceGate.hardBlocked).toBe(true);
  });

  it("allows a high-conviction strong buy only when verified data supports it", () => {
    const decision = deriveRecommendationV3(scoreFixture(), coverageFixture());

    expect(decision.rating).toBe("STRONG_BUY");
    expect(decision.conviction).toBeGreaterThanOrEqual(80);
    expect(decision.calibrationStatus).toBe("UNCALIBRATED_V3_BASELINE");
    expect(decision.drivers[0]?.key).toBe("valuation");
  });

  it("uses objective horizon scores without changing the underlying user match", () => {
    const score = scoreFixture({ shortTermScore: 49, longTermScore: 88, personalizedScore: 97 });
    const short = deriveRecommendationV3(score, coverageFixture(), { horizon: "short" });
    const long = deriveRecommendationV3(score, coverageFixture(), { horizon: "long" });

    expect(short.rating).toBe("WAIT");
    expect(short.objectiveScore).toBe(49);
    expect(long.rating).toBe("STRONG_BUY");
    expect(long.objectiveScore).toBe(88);
    expect(short.userMatchScore).toBe(97);
    expect(long.userMatchScore).toBe(97);
  });

  it("maps recommendation keys cleanly without mixing Swedish and English", () => {
    expect(recommendationV3Label("STRONG_BUY", "sv")).toBe("STARKT KÖP");
    expect(recommendationV3Label("REDUCE", "sv")).toBe("MINSKA");
    expect(recommendationV3Label("WAIT", "en")).toBe("WAIT");
    expect(recommendationV3Label("SELL", "en")).toBe("SELL");
  });
});
