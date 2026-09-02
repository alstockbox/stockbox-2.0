import { describe, expect, it } from "vitest";
import { buildIntelligenceSummary } from "@/lib/analysis/intelligence-report";
import type { AnalysisReport, ScoreDimension } from "@/lib/analysis/types";

function dimension(key: ScoreDimension["key"], score: number): ScoreDimension {
  return { key, label: key, score, weight: 1 };
}

function report(): AnalysisReport {
  return {
    id: "intelligence-report",
    ticker: "IR",
    companyName: "Intelligence Report AB",
    analysisType: "deep",
    investmentProfile: "balanced",
    generatedAt: "2026-09-02T08:00:00.000Z",
    summary: "",
    recommendation: "Buy",
    shortTermAssessment: "",
    longTermAssessment: "",
    metrics: {
      revenueGrowth1y: 0.17, revenueCagr3y: 0.13, epsGrowth1y: 0.2, grossMargin: 0.45,
      operatingMargin: 0.17, netMargin: 0.12, fcf: 100, fcfMargin: 0.13, cashConversion: 0.9,
      debtToEquity: 0.2, debtToAssets: 0.15, netDebt: -40, interestCoverage: 10,
      earningsYield: 0.05, fcfYield: 0.045, priceMomentum1y: 0.18, priceMomentum3m: 0.08,
    },
    score: {
      score: 81, personalizedScore: 82, confidence: 89, missingData: [], dimensions: [
        dimension("growth", 82), dimension("financialHealth", 85), dimension("cashFlow", 78),
        dimension("valuation", 80), dimension("momentum", 72), dimension("quality", 84),
      ],
    },
    dcf: { suitable: true, bear: 80, base: 120, bull: 150, assumptions: { startingFcf: 100, years: 5, growthRate: 0.1, discountRate: 0.1, terminalGrowthRate: 0.025, marginOfSafety: 0.2 } },
    redFlags: [], greenFlags: [], scenarios: [], sources: [],
    market: { ticker: "IR", price: 90, currency: "SEK", date: "2026-09-02", volume: 50000, yearHigh: 98, yearLow: 60, performance: { "3M": 0.08, "1Y": 0.18 } },
    forwardEstimates: { nextYearRevenueGrowth: 0.18, nextYearEpsGrowth: 0.24 },
    providerDiagnostics: [{ provider: "twelve-data", capability: "estimates", status: "available", observedAt: "2026-09-02T08:00:00.000Z" }],
  } as AnalysisReport;
}

describe("buildIntelligenceSummary", () => {
  it("returns a user-facing summary with separate scores, confidence and explainable drivers", () => {
    const result = buildIntelligenceSummary(report());
    expect(result.scores.coreQuality).toBe(81);
    expect(result.scores.mispricing).not.toBeNull();
    expect(result.scores.inflection).not.toBeNull();
    expect(result.scores.opportunity).not.toBeNull();
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.topDrivers.length).toBeGreaterThan(0);
    expect(result.headline.length).toBeGreaterThan(15);
  });
});
