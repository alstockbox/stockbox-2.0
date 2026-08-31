import { describe, expect, it } from "vitest";
import { toPublicCompanySnapshot } from "./catalog";
import type { CompanyMetricSnapshot } from "./types";

function privateSnapshot(): CompanyMetricSnapshot {
  return {
    ticker: "TEST",
    companyName: "Test Co",
    capturedAt: "2026-09-01T00:00:00.000Z",
    analysisId: "private-analysis-id",
    price: 100,
    priceChange1d: 0.01,
    score: 77,
    personalizedScore: 91,
    confidence: 0.8,
    coverage: 0.9,
    fairValue: 120,
    fairValueLow: 100,
    fairValueHigh: 140,
    fairValueUpside: 0.2,
    archetype: "standard",
    valuation: { pe: 20, forwardPe: null, ps: 3, evSales: 4, evEbitda: 12, fcfYield: 0.05, dividendYield: 0.02, historicalPePercentile: 0.3, peVs5yMedian: -0.1, peVs10yMedian: -0.15 },
    fundamentals: { revenueGrowth: 0.1, epsGrowth: 0.12, fcf: 1000, fcfGrowth: 0.08, fcfMargin: 0.15, grossMargin: 0.5, operatingMargin: 0.2, netMargin: 0.15, roic: 0.18, roe: 0.2, netDebt: 100, netDebtToEbitda: 0.5 },
    dividend: { yield: 0.02, payoutRatio: 0.4, fcfPayoutRatio: 0.35, growth: 0.06, dividendPerShare: 2 },
    estimates: { revenueGrowth: 0.11, epsGrowth: 0.13, fcfGrowth: null, targetPrice: null },
    dimensions: { growth: 75, profitability: 80, valuation: 70 },
    riskFlags: [],
    sourceMeta: { investmentProfile: "growth", provider: "private" },
  };
}

describe("public company metric catalog privacy", () => {
  it("strips user-specific analysis, profile score and source metadata", () => {
    const publicSnapshot = toPublicCompanySnapshot(privateSnapshot());
    expect(publicSnapshot).not.toHaveProperty("analysisId");
    expect(publicSnapshot).not.toHaveProperty("personalizedScore");
    expect(publicSnapshot).not.toHaveProperty("sourceMeta");
    expect(publicSnapshot.score).toBe(77);
    expect(publicSnapshot.valuation.pe).toBe(20);
    expect(publicSnapshot.fundamentals.roic).toBe(0.18);
  });
});
