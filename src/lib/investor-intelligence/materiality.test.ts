import { describe, expect, it } from "vitest";
import { detectMaterialChanges } from "./materiality";
import type { CompanyMetricSnapshot } from "./types";

function baseSnapshot(): CompanyMetricSnapshot {
  return {
    ticker: "MSFT",
    companyName: "Microsoft",
    capturedAt: "2026-08-31T20:00:00.000Z",
    analysisId: "analysis-1",
    price: 100,
    priceChange1d: 0,
    score: 85,
    personalizedScore: 86,
    confidence: 0.9,
    coverage: 0.92,
    fairValue: 120,
    fairValueLow: 105,
    fairValueHigh: 135,
    fairValueUpside: 0.2,
    archetype: "software_growth",
    valuation: {
      pe: 25,
      forwardPe: 23,
      ps: 8,
      evSales: 7.5,
      evEbitda: 18,
      fcfYield: 0.04,
      dividendYield: 0.01,
      historicalPePercentile: 0.4,
      peVs5yMedian: -0.05,
      peVs10yMedian: -0.1,
    },
    fundamentals: {
      revenueGrowth: 0.12,
      epsGrowth: 0.14,
      fcf: 100,
      fcfGrowth: 0.1,
      fcfMargin: 0.25,
      grossMargin: 0.7,
      operatingMargin: 0.25,
      netMargin: 0.3,
      roic: 0.2,
      roe: 0.25,
      netDebt: 10,
      netDebtToEbitda: 0.5,
    },
    dividend: {
      yield: 0.01,
      payoutRatio: 0.25,
      fcfPayoutRatio: 0.22,
      growth: 0.08,
      dividendPerShare: 3,
    },
    estimates: { revenueGrowth: 0.12, epsGrowth: 0.14, fcfGrowth: null, targetPrice: null },
    dimensions: { growth: 84, profitability: 90, valuation: 76, risk: 82 },
    riskFlags: [],
    sourceMeta: {},
  };
}

function changed(mutator: (snapshot: CompanyMetricSnapshot) => void) {
  const previous = baseSnapshot();
  const current = structuredClone(previous);
  current.analysisId = "analysis-2";
  current.capturedAt = "2026-09-01T20:00:00.000Z";
  mutator(current);
  return { previous, current };
}

describe("detectMaterialChanges", () => {
  it("treats an ordinary 2% price move as minor", () => {
    const pair = changed((current) => { current.price = 102; });
    const changes = detectMaterialChanges(pair);
    const price = changes.find((item) => item.metricKey === "price");

    expect(price?.materiality).toBe("MINOR");
    expect(price?.reasoning).toMatch(/price/i);
  });

  it("treats a large operating-margin deterioration as important", () => {
    const pair = changed((current) => { current.fundamentals.operatingMargin = 0.18; });
    const changes = detectMaterialChanges(pair);
    const margin = changes.find((item) => item.metricKey === "fundamentals.operatingMargin");

    expect(margin?.materiality).toBe("IMPORTANT");
    expect(margin?.reasoning).toMatch(/margin/i);
  });

  it("treats positive-to-negative free cash flow as important even when percentage math is unhelpful", () => {
    const pair = changed((current) => { current.fundamentals.fcf = -1; });
    const changes = detectMaterialChanges(pair);
    const fcf = changes.find((item) => item.metricKey === "fundamentals.fcf");

    expect(fcf?.materiality).toBe("IMPORTANT");
    expect(fcf?.reasoning).toMatch(/positive.*negative/i);
  });

  it("escalates a changed metric to thesis-changing when it newly violates an explicit thesis requirement", () => {
    const pair = changed((current) => { current.fundamentals.revenueGrowth = 0.09; });
    const changes = detectMaterialChanges({
      ...pair,
      thesisFailures: new Set(["fundamentals.revenueGrowth"]),
    });
    const growth = changes.find((item) => item.metricKey === "fundamentals.revenueGrowth");

    expect(growth?.materiality).toBe("THESIS_CHANGING");
    expect(growth?.reasoning).toMatch(/thesis/i);
  });
});
