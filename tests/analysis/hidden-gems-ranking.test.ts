import { describe, expect, it } from "vitest";
import { rankHiddenGems, type AlphaPredictionSnapshot } from "../../src/lib/alpha/hidden-gems";

function snapshot(overrides: Partial<AlphaPredictionSnapshot> = {}): AlphaPredictionSnapshot {
  return {
    id: "p1",
    analysisId: "a1",
    ticker: "BOX",
    companyName: "Box Systems",
    sector: "technology",
    archetype: "standard",
    marketCap: 1_000_000_000,
    marketCapCurrency: "USD",
    marketCapBand: "small",
    fundamentalScore: 72,
    alphaScore: 75,
    breakoutScore: 78,
    classification: "high_potential",
    confidence: 0.8,
    scores: {
      undervaluation: 70,
      quality: 75,
      growthAcceleration: 80,
      earningsInflection: 82,
      catalyst: 65,
      momentum: 70,
      estimateRevisions: 50,
      sentimentShift: 50,
      smallCapAsymmetry: 76,
      breakoutProbability: 78,
    },
    risk: { financialRisk: 20, dilutionRisk: 10, liquidityRisk: 35, hypeRisk: 20, overall: 24 },
    probabilities: {
      oneMonth: { up10: 0.55, up25: 0.30, up50: 0.12 },
      threeMonths: { up10: 0.68, up25: 0.44, up50: 0.22 },
      sixMonths: { up10: 0.75, up25: 0.55, up50: 0.31 },
      twelveMonths: { up10: 0.82, up25: 0.65, up50: 0.42 },
    },
    strongestSignals: ["Growth acceleration"],
    riskSignals: [],
    modelVersion: "alpha-1.1.0",
    predictionAsOf: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("Hidden Gems ranking", () => {
  it("keeps only the latest prediction per ticker for current rankings", () => {
    const rows = [
      snapshot({ id: "old", alphaScore: 55, predictionAsOf: "2026-08-20T12:00:00.000Z" }),
      snapshot({ id: "new", alphaScore: 79, predictionAsOf: "2026-09-01T12:00:00.000Z" }),
    ];

    const ranked = rankHiddenGems(rows, { category: "highest_breakout", horizon: "sixMonths" });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.id).toBe("new");
    expect(ranked[0]?.alphaChange).toBe(24);
  });

  it("ranks undervaluation with alpha quality and risk gates instead of cheapness alone", () => {
    const healthy = snapshot({ id: "healthy", ticker: "GOOD", scores: { ...snapshot().scores, undervaluation: 86 }, alphaScore: 80, confidence: 0.82 });
    const valueTrap = snapshot({
      id: "trap", ticker: "TRAP", alphaScore: 48, confidence: 0.74,
      scores: { ...snapshot().scores, undervaluation: 98, quality: 25, growthAcceleration: 20 },
      risk: { financialRisk: 82, dilutionRisk: 60, liquidityRisk: 30, hypeRisk: 20, overall: 65 },
    });

    const ranked = rankHiddenGems([valueTrap, healthy], { category: "undervalued", horizon: "sixMonths" });
    expect(ranked[0]?.ticker).toBe("GOOD");
  });

  it("supports size and risk filters without mixing market-cap currencies", () => {
    const micro = snapshot({ id: "micro", ticker: "MICRO", marketCapBand: "micro", risk: { ...snapshot().risk, overall: 58 } });
    const large = snapshot({ id: "large", ticker: "LARGE", marketCapBand: "large", risk: { ...snapshot().risk, overall: 20 } });

    expect(rankHiddenGems([micro, large], { category: "small_cap", marketCapBand: "micro", riskBand: "medium", horizon: "sixMonths" }).map((row) => row.ticker)).toEqual(["MICRO"]);
    expect(rankHiddenGems([micro, large], { category: "highest_breakout", marketCapBand: "large", riskBand: "low", horizon: "sixMonths" }).map((row) => row.ticker)).toEqual(["LARGE"]);
  });

  it("uses the selected horizon probability in breakout ranking", () => {
    const nearTerm = snapshot({
      id: "near", ticker: "NEAR", breakoutScore: 76,
      probabilities: { ...snapshot().probabilities, oneMonth: { up10: 0.80, up25: 0.60, up50: 0.30 }, twelveMonths: { up10: 0.70, up25: 0.40, up50: 0.20 } },
    });
    const longTerm = snapshot({
      id: "long", ticker: "LONG", breakoutScore: 76,
      probabilities: { ...snapshot().probabilities, oneMonth: { up10: 0.60, up25: 0.35, up50: 0.15 }, twelveMonths: { up10: 0.90, up25: 0.75, up50: 0.50 } },
    });

    expect(rankHiddenGems([nearTerm, longTerm], { category: "highest_breakout", horizon: "oneMonth" })[0]?.ticker).toBe("NEAR");
    expect(rankHiddenGems([nearTerm, longTerm], { category: "highest_breakout", horizon: "twelveMonths" })[0]?.ticker).toBe("LONG");
  });
});
