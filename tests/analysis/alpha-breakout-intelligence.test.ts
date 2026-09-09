import { describe, expect, it } from "vitest";
import { computeAlphaIntelligence, type AlphaSignalInput } from "../../src/lib/alpha";

function baseInput(overrides: Partial<AlphaSignalInput> = {}): AlphaSignalInput {
  return {
    ticker: "BOX",
    companyName: "Box Systems",
    sector: "technology",
    archetype: "standard",
    analysisDate: "2026-09-01T12:00:00.000Z",
    market: {
      price: 25,
      marketCap: 1_200_000_000,
      volume: 180_000,
      yearHigh: 31,
      yearLow: 15,
      performance1m: 0.06,
      performance3m: 0.14,
      performance6m: 0.18,
      performance1y: 0.24,
    },
    valuation: {
      pe: 14,
      evEbitda: 9,
      fcfYield: 0.075,
      earningsYield: 0.07,
    },
    balanceSheet: {
      debtToEquity: 0.25,
      netDebtToEbitda: 0.5,
      interestCoverage: 11,
      currentRatio: 1.8,
    },
    history: [
      { period: "2023", revenueGrowth: 0.05, operatingMargin: 0.08, epsGrowth: 0.03, fcfMargin: 0.06, shareGrowth: 0.01 },
      { period: "2024", revenueGrowth: 0.10, operatingMargin: 0.10, epsGrowth: 0.13, fcfMargin: 0.08, shareGrowth: 0.01 },
      { period: "2025", revenueGrowth: 0.18, operatingMargin: 0.14, epsGrowth: 0.29, fcfMargin: 0.12, shareGrowth: 0.005 },
    ],
    forward: {
      revenueGrowth: 0.19,
      epsGrowth: 0.27,
      fcfGrowth: 0.22,
    },
    catalyst: {
      strength: 0.65,
      confidence: 0.7,
      sourceCount: 2,
    },
    dataQuality: 0.9,
    ...overrides,
  };
}

describe("StockBox Alpha / Breakout Intelligence", () => {
  it("rewards simultaneous fundamental acceleration instead of raw momentum alone", () => {
    const accelerating = computeAlphaIntelligence(baseInput());
    const deteriorating = computeAlphaIntelligence(baseInput({
      history: [
        { period: "2023", revenueGrowth: 0.22, operatingMargin: 0.16, epsGrowth: 0.30, fcfMargin: 0.13, shareGrowth: 0.01 },
        { period: "2024", revenueGrowth: 0.12, operatingMargin: 0.12, epsGrowth: 0.12, fcfMargin: 0.09, shareGrowth: 0.02 },
        { period: "2025", revenueGrowth: 0.04, operatingMargin: 0.08, epsGrowth: -0.08, fcfMargin: 0.04, shareGrowth: 0.04 },
      ],
      forward: { revenueGrowth: 0.03, epsGrowth: -0.04, fcfGrowth: 0.01 },
    }));

    expect(accelerating.scores.growthAcceleration).toBeGreaterThan(deteriorating.scores.growthAcceleration);
    expect(accelerating.scores.earningsInflection).toBeGreaterThan(deteriorating.scores.earningsInflection);
    expect(accelerating.alphaScore).toBeGreaterThan(deteriorating.alphaScore);
  });

  it("does not label a momentum-only low-quality setup as a top breakout", () => {
    const result = computeAlphaIntelligence(baseInput({
      market: {
        price: 11,
        marketCap: 180_000_000,
        volume: 12_000,
        yearHigh: 12,
        yearLow: 2,
        performance1m: 0.65,
        performance3m: 1.4,
        performance6m: 1.9,
        performance1y: 2.6,
      },
      valuation: { pe: null, evEbitda: null, fcfYield: -0.08, earningsYield: -0.12 },
      balanceSheet: { debtToEquity: 2.8, netDebtToEbitda: 7.5, interestCoverage: 0.6, currentRatio: 0.65 },
      history: [
        { period: "2023", revenueGrowth: 0.08, operatingMargin: -0.18, epsGrowth: -0.30, fcfMargin: -0.22, shareGrowth: 0.18 },
        { period: "2024", revenueGrowth: 0.03, operatingMargin: -0.21, epsGrowth: -0.40, fcfMargin: -0.27, shareGrowth: 0.25 },
        { period: "2025", revenueGrowth: -0.05, operatingMargin: -0.28, epsGrowth: -0.55, fcfMargin: -0.31, shareGrowth: 0.36 },
      ],
      forward: { revenueGrowth: null, epsGrowth: null, fcfGrowth: null },
      catalyst: { strength: 0.2, confidence: 0.25, sourceCount: 1 },
      dataQuality: 0.72,
    }));

    expect(result.scores.momentum).toBeGreaterThan(70);
    expect(result.risk.dilutionRisk).toBeGreaterThan(70);
    expect(result.risk.financialRisk).toBeGreaterThan(70);
    expect(result.alphaScore).toBeLessThan(65);
    expect(result.classification).not.toBe("exceptional");
  });

  it("recognizes a healthy accelerating small cap as asymmetric without making small size itself bullish", () => {
    const healthySmallCap = computeAlphaIntelligence(baseInput({
      market: { ...baseInput().market, marketCap: 350_000_000, volume: 95_000 },
    }));
    const weakSmallCap = computeAlphaIntelligence(baseInput({
      market: { ...baseInput().market, marketCap: 350_000_000, volume: 95_000 },
      history: [
        { period: "2023", revenueGrowth: 0.08, operatingMargin: 0.09, epsGrowth: 0.07, fcfMargin: 0.07, shareGrowth: 0.01 },
        { period: "2024", revenueGrowth: 0.05, operatingMargin: 0.07, epsGrowth: 0.02, fcfMargin: 0.05, shareGrowth: 0.06 },
        { period: "2025", revenueGrowth: -0.02, operatingMargin: 0.03, epsGrowth: -0.15, fcfMargin: 0.01, shareGrowth: 0.12 },
      ],
      balanceSheet: { debtToEquity: 1.9, netDebtToEbitda: 5.5, interestCoverage: 1.2, currentRatio: 0.8 },
    }));

    expect(healthySmallCap.scores.smallCapAsymmetry).toBeGreaterThan(weakSmallCap.scores.smallCapAsymmetry);
    expect(healthySmallCap.risk.liquidityRisk).toBeGreaterThan(0);
  });

  it("returns bounded and monotonic upside probabilities with explicit confidence", () => {
    const result = computeAlphaIntelligence(baseInput());
    const p = result.probabilities.sixMonths;

    expect(p.up10).toBeGreaterThanOrEqual(p.up25);
    expect(p.up25).toBeGreaterThanOrEqual(p.up50);
    expect(p.up50).toBeGreaterThanOrEqual(0);
    expect(p.up10).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.modelVersion).toMatch(/^alpha-/);
  });
});
