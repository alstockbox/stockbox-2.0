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
        rawScore: 88,
        adjustedScore: 88,
        coverage: 1,
        plannedWeight: 1,
        availableWeight: 1,
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
      entityIdentity: 100,
      currencyAlignment: 100,
      archetypeConfidence: 100,
      specializedCoverage: 100,
      marketInputFreshness: 100,
      valuationAssumptions: 100,
      sourceConflict: 100,
    },
    dataCoverage: 1,
    dimensions,
    shortTermScore: 78,
    longTermScore: 89,
    methodology: {
      modelVersion: "test",
      scorePolicyVersion: "test-policy",
      benchmarkVersion: "test-benchmarks",
      sectorWeights: Object.fromEntries(dimensionKeys.map((key) => [key, 0.125])) as ScoreResult["methodology"]["sectorWeights"],
      personalizedWeights: Object.fromEntries(dimensionKeys.map((key) => [key, 0.125])) as ScoreResult["methodology"]["personalizedWeights"],
    },
    missingData: [],
    ...overrides,
  };
}

const completeSpecializedCoverage: NonNullable<ScoreResult["specializedCoverage"]> = {
  overall: 1,
  required: ["verifiedSpecializedMetric"],
  available: ["verifiedSpecializedMetric"],
  missing: [],
};

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

  it("does not use low-confidence DCF output as directional valuation support", () => {
    const recommendation = deriveRecommendation(mockScoreResult(), [], {
      ...supportedValuation,
      confidence: 35,
    });

    expect(recommendation.rating).toBe("Hold");
    expect(recommendation.constraintsApplied).toContain("Directional ratings require adequate valuation coverage.");
  });

  it("does not use an illustrative fallback-heavy DCF as directional valuation support", () => {
    const recommendation = deriveRecommendation(mockScoreResult(), [], {
      ...supportedValuation,
      confidence: 80,
      directionalSupport: false,
    });

    expect(recommendation.rating).toBe("Hold");
    expect(recommendation.constraintsApplied).toContain("Directional ratings require adequate valuation coverage.");
  });

  it("accepts strong archetype valuation when corporate DCF is inappropriate", () => {
    const score = mockScoreResult({
      analysisArchetype: "bank",
      sector: "financials",
      specializedCoverage: completeSpecializedCoverage,
    });
    const recommendation = deriveRecommendation(score, [], {
      ...supportedValuation,
      status: "inappropriate",
      method: "Residual income / P-TBV",
      impliedUpside: null,
    });
    expect(recommendation.rating).toBe("Strong Buy");
  });

  it("does not accept a neutral archetype multiple as positive valuation support", () => {
    const score = mockScoreResult({
      analysisArchetype: "bank",
      sector: "financials",
      specializedCoverage: completeSpecializedCoverage,
    });
    score.dimensions.valuation.score = 55;
    const recommendation = deriveRecommendation(score, [], {
      ...supportedValuation,
      status: "inappropriate",
      method: "Residual income / P-TBV",
      impliedUpside: null,
    });
    expect(recommendation.rating).toBe("Hold");
    expect(recommendation.constraintsApplied).toContain("Buy requires positive valuation support.");
  });

  it.each(["unknown", "holding_company", "pre_revenue_biotech"] as const)(
    "returns No Rating for %s without a valid specialized valuation",
    (analysisArchetype) => {
      const score = mockScoreResult({ analysisArchetype });
      const recommendation = deriveRecommendation(score, [], {
        ...supportedValuation,
        status: "inappropriate",
        method: "Specialized valuation required",
        impliedUpside: null,
      });
      expect(recommendation.rating).toBe("No Rating");
      expect(recommendation.constraintsApplied).toContain("The company archetype requires specialized valuation coverage before a rating is issued.");
    },
  );
});

describe("recommendation confidence floor", () => {
  it("returns No Rating for neutral scores when confidence is below 40", () => {
    const recommendation = deriveRecommendation(
      mockScoreResult({ personalizedScore: 52, stockBoxScore: 52, confidence: 35 }),
      [],
      supportedValuation,
    );

    expect(recommendation.rating).toBe("No Rating");
    expect(recommendation.constraintsApplied).toContain("Confidence below 40 results in No Rating.");
  });
});

describe("specialized valuation coverage", () => {
  it("requires full-enough specialized valuation coverage before rating a bank", () => {
    const score = mockScoreResult({
      analysisArchetype: "bank",
      sector: "financials",
      specializedCoverage: completeSpecializedCoverage,
    });
    score.dimensions.valuation.coverage = 0.55;
    score.dimensions.valuation.score = 90;

    const recommendation = deriveRecommendation(score, [], {
      ...supportedValuation,
      status: "inappropriate",
      method: "Residual income / P-TBV",
      impliedUpside: null,
    });

    expect(recommendation.rating).toBe("No Rating");
    expect(recommendation.constraintsApplied).toContain("The company archetype requires specialized valuation coverage before a rating is issued.");
  });

  it.each([
    [0.699, "No Rating"],
    [0.7, "Strong Buy"],
  ] as const)("applies the specialized coverage threshold at %s", (overall, expected) => {
    const coverage = {
      ...completeSpecializedCoverage,
      overall,
      missing: overall < 0.7 ? ["requiredMetric"] : [],
    };
    const score = mockScoreResult({
      analysisArchetype: "bank",
      sector: "financials",
      specializedCoverage: coverage,
    });
    const recommendation = deriveRecommendation(score, [], {
      ...supportedValuation,
      status: "inappropriate",
      method: "Residual income / P-TBV",
      impliedUpside: null,
    });

    expect(recommendation.rating).toBe(expected);
  });

  it("requires critical bank capital coverage even when overall specialized coverage is high", () => {
    const score = mockScoreResult({
      analysisArchetype: "bank",
      sector: "financials",
      specializedCoverage: {
        overall: 0.9,
        required: ["netInterestMargin", "grossLoans", "deposits", "cet1CapitalRatio", "tangibleBookValuePerShare"],
        available: ["netInterestMargin", "grossLoans", "deposits", "tangibleBookValuePerShare"],
        missing: ["cet1CapitalRatio"],
      },
    });

    const recommendation = deriveRecommendation(score, [], {
      ...supportedValuation,
      status: "inappropriate",
      method: "Residual income / P-TBV",
      impliedUpside: null,
    });

    expect(recommendation.rating).toBe("No Rating");
    expect(recommendation.constraintsApplied).toContain("Critical specialized coverage is incomplete for this company archetype.");
  });

  it("requires critical insurer regulatory coverage even when overall specialized coverage is high", () => {
    const score = mockScoreResult({
      analysisArchetype: "insurer",
      sector: "financials",
      specializedCoverage: {
        overall: 0.9,
        required: ["premiumGrowth", "combinedRatio", "lossRatio", "bookValue", "regulatoryCapitalRatio"],
        available: ["premiumGrowth", "combinedRatio", "lossRatio", "bookValue"],
        missing: ["regulatoryCapitalRatio"],
      },
    });

    const recommendation = deriveRecommendation(score, [], {
      ...supportedValuation,
      status: "inappropriate",
      method: "Insurance book-value multiples",
      impliedUpside: null,
    });

    expect(recommendation.rating).toBe("No Rating");
    expect(recommendation.constraintsApplied).toContain("Critical specialized coverage is incomplete for this company archetype.");
  });

  it("requires critical REIT AFFO and fixed-charge coverage even when overall specialized coverage is high", () => {
    const score = mockScoreResult({
      analysisArchetype: "reit",
      sector: "realEstate",
      specializedCoverage: {
        overall: 0.85,
        required: ["fundsFromOperations", "adjustedFundsFromOperations", "adjustedFundsFromOperationsPayout", "dividendCoverage", "fixedChargeCoverage"],
        available: ["fundsFromOperations", "adjustedFundsFromOperationsPayout", "dividendCoverage"],
        missing: ["adjustedFundsFromOperations", "fixedChargeCoverage"],
      },
    });

    const recommendation = deriveRecommendation(score, [], {
      ...supportedValuation,
      status: "inappropriate",
      method: "AFFO / NAV",
      impliedUpside: null,
    });

    expect(recommendation.rating).toBe("No Rating");
    expect(recommendation.constraintsApplied).toContain("Critical specialized coverage is incomplete for this company archetype.");
  });
});

describe("recommendation boundary matrix", () => {
  it.each([
    [84, 72, 0.15, "Strong Buy"],
    [83.9, 72, 0.15, "Buy"],
    [68, 55, 0.05, "Buy"],
    [67.9, 55, 0, "Hold"],
    [40, 55, -0.05, "Sell"],
    [40.1, 55, -0.05, "Hold"],
    [24, 70, -0.15, "Strong Sell"],
    [24.1, 70, -0.15, "Sell"],
  ] as const)("score %s at confidence %s and valuation %s -> %s", (value, confidence, impliedUpside, expected) => {
    const score = mockScoreResult({ stockBoxScore: value, personalizedScore: value, confidence });
    const recommendation = deriveRecommendation(
      score,
      value <= 24 ? [criticalFlag] : [],
      { ...supportedValuation, impliedUpside },
    );

    expect(recommendation.rating).toBe(expected);
  });

  it.each([
    [39, "No Rating"],
    [40, "Hold"],
    [54, "Hold"],
    [55, "Buy"],
    [69, "Buy"],
    [70, "Buy"],
    [71, "Buy"],
    [72, "Strong Buy"],
  ] as const)("confidence %s applies the positive-direction gate -> %s", (confidence, expected) => {
    const recommendation = deriveRecommendation(
      mockScoreResult({ confidence }),
      [],
      { ...supportedValuation, impliedUpside: 0.15 },
    );

    expect(recommendation.rating).toBe(expected);
  });

  it.each([
    [69, "Sell"],
    [70, "Strong Sell"],
  ] as const)("confidence %s applies the strong-sell gate -> %s", (confidence, expected) => {
    const recommendation = deriveRecommendation(
      mockScoreResult({ stockBoxScore: 24, personalizedScore: 24, confidence }),
      [criticalFlag],
      { ...supportedValuation, impliedUpside: -0.15 },
    );

    expect(recommendation.rating).toBe(expected);
  });

  it.each([
    [0.15, "Strong Buy"],
    [0.05, "Buy"],
    [0, "Hold"],
    [-0.05, "Hold"],
    [-0.15, "Hold"],
  ] as const)("valuation support %s constrains a high score to %s", (impliedUpside, expected) => {
    const recommendation = deriveRecommendation(
      mockScoreResult({ confidence: 90 }),
      [],
      { ...supportedValuation, impliedUpside },
    );

    expect(recommendation.rating).toBe(expected);
  });
});
