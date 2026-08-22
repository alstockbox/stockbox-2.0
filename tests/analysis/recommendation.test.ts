import { describe, expect, it } from "vitest";
import { deriveRecommendation, type DcfRangeResult, type RedFlag, type ScoreDimensionKey, type ScoreResult } from "../../src/lib/analysis";

const supportedValuation: DcfRangeResult = {
  status: "available",
  method: "FCFF DCF",
  low: 90,
  mid: 120,
  high: 145,
  currentPrice: 100,
  impliedUpside: 0.2,
  scenarios: [],
  missingData: [],
};

function mockScoreResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  const dimensionKeys: ScoreDimensionKey[] = [
    "growth",
    "profitability",
    "financialHealth",
    "valuation",
    "cashFlow",
    "quality",
    "momentum",
    "risk",
  ];
  const dimensions = Object.fromEntries(
    dimensionKeys.map((key) => [
      key,
      {
        key,
        label: key,
        score: 88,
        weight: 0.125,
        contributors: [],
        missingData: [],
      },
    ]),
  ) as unknown as ScoreResult["dimensions"];

  return {
    stockBoxScore: 88,
    personalizedScore: 90,
    investmentProfile: "growth",
    sector: "technology",
    analysisArchetype: "standard",
    confidence: 86,
    confidenceBreakdown: {
      dataCoverage: 100,
      dataFreshness: 100,
      sourceQuality: 100,
      reconciliation: 100,
      estimateAvailability: 100,
      valuationInputs: 100,
    },
    dataCoverage: 1,
    dimensions,
    shortTermScore: 78,
    longTermScore: 89,
    methodology: {
      modelVersion: "test",
      sectorWeights: Object.fromEntries(dimensionKeys.map((key) => [key, 0.125])) as ScoreResult["methodology"]["sectorWeights"],
      personalizedWeights: Object.fromEntries(dimensionKeys.map((key) => [key, 0.125])) as ScoreResult["methodology"]["personalizedWeights"],
    },
    missingData: [],
    ...overrides,
  };
}

const criticalFlag: RedFlag = {
  code: "critical_test",
  label: "Critical leverage",
  severity: "critical",
  rationale: "Test critical flag.",
};

describe("deriveRecommendation", () => {
  it("allows Strong Buy only when score, confidence and constraints support it", () => {
    const recommendation = deriveRecommendation(mockScoreResult(), [], supportedValuation);

    expect(recommendation.rating).toBe("Strong Buy");
    expect(recommendation.disclosure).toContain("not a guaranteed outcome");
  });

  it("caps high scores when confidence is too low", () => {
    const recommendation = deriveRecommendation(mockScoreResult({ confidence: 35 }), [], supportedValuation);

    expect(recommendation.rating).toBe("No Rating");
    expect(recommendation.constraintsApplied).toContain("Confidence below 40 results in No Rating.");
  });

  it("prevents Buy ratings when critical red flags are unresolved", () => {
    const recommendation = deriveRecommendation(mockScoreResult(), [criticalFlag], supportedValuation);

    expect(recommendation.rating).toBe("Hold");
    expect(recommendation.constraintsApplied).toContain("Critical unresolved red flags prevent Buy ratings.");
  });

  it("does not turn high business quality into Buy without valuation support", () => {
    const recommendation = deriveRecommendation(mockScoreResult(), [], {
      ...supportedValuation,
      impliedUpside: 0,
    });
    expect(recommendation.rating).toBe("Hold");
    expect(recommendation.constraintsApplied).toContain("Buy requires positive valuation support.");
  });
});
