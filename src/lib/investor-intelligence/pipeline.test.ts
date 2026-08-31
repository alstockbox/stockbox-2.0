import { describe, expect, it } from "vitest";
import { evaluateInvestorIntelligence } from "./pipeline";
import type { CompanyMetricSnapshot } from "./types";

function snapshot(id: string): CompanyMetricSnapshot {
  return {
    ticker: "MSFT", companyName: "Microsoft", capturedAt: "2026-08-31T20:00:00.000Z", analysisId: id,
    price: 180, priceChange1d: 0, score: 85, personalizedScore: 86, confidence: 0.9, coverage: 0.95,
    fairValue: 210, fairValueLow: 190, fairValueHigh: 230, fairValueUpside: 210 / 180 - 1, archetype: "software_growth",
    valuation: { pe: 25, forwardPe: null, ps: 8, evSales: 7, evEbitda: 18, fcfYield: 0.04, dividendYield: 0.01, historicalPePercentile: 0.4, peVs5yMedian: -0.05, peVs10yMedian: -0.1 },
    fundamentals: { revenueGrowth: 0.12, epsGrowth: 0.14, fcf: 100, fcfGrowth: 0.1, fcfMargin: 0.25, grossMargin: 0.7, operatingMargin: 0.3, netMargin: 0.25, roic: 0.2, roe: 0.25, netDebt: 10, netDebtToEbitda: 0.5 },
    dividend: { yield: 0.01, payoutRatio: 0.25, fcfPayoutRatio: 0.2, growth: 0.08, dividendPerShare: 3 },
    estimates: { revenueGrowth: 0.13, epsGrowth: 0.15, fcfGrowth: null, targetPrice: null },
    dimensions: { growth: 85, quality: 92, valuation: 75 }, riskFlags: [], sourceMeta: {},
  };
}

describe("investor intelligence pipeline", () => {
  it("connects thesis failure, thesis-changing materiality and alert transitions", () => {
    const previous = snapshot("a1");
    const current = structuredClone(previous);
    current.analysisId = "a2";
    current.capturedAt = "2026-09-01T20:00:00.000Z";
    current.fundamentals.revenueGrowth = 0.09;
    current.valuation.pe = 21;

    const result = evaluateInvestorIntelligence({
      previous,
      current,
      thesis: {
        currentStatus: "INTACT",
        rules: [{ id: "growth", label: "Revenue growth > 10%", metricKey: "fundamentals.revenueGrowth", operator: "gt", threshold: 0.1, critical: false, failureStatus: "WATCH" }],
        previousResults: { growth: "passed" },
      },
      alerts: [{ id: "pe-buy-zone", kind: "valuation", condition: { metricKey: "valuation.pe", operator: "below", threshold: 22 } }],
    });

    expect(result.thesis?.status).toBe("WATCH");
    expect(result.changes.find((change) => change.metricKey === "fundamentals.revenueGrowth")?.materiality).toBe("THESIS_CHANGING");
    expect(result.triggeredAlerts).toHaveLength(1);
    expect(result.triggeredAlerts[0]?.alert.id).toBe("pe-buy-zone");
  });

  it("works without a thesis and never invents unavailable alert values", () => {
    const previous = snapshot("a1");
    const current = structuredClone(previous);
    current.analysisId = "a2";
    current.fundamentals.roic = null;

    const result = evaluateInvestorIntelligence({
      previous,
      current,
      alerts: [{ id: "roic", kind: "fundamental", condition: { metricKey: "fundamentals.roic", operator: "below", threshold: 0.15 } }],
    });

    expect(result.thesis).toBeNull();
    expect(result.triggeredAlerts).toEqual([]);
    expect(result.alertEvaluations[0]?.evaluation.status).toBe("unavailable");
  });
});
