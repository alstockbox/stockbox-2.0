import { describe, expect, it } from "vitest";
import { buildOpportunityView } from "@/lib/analysis/opportunity-engine";
import type { AnalysisReport, ScoreDimension } from "@/lib/analysis/types";

function dimension(key: ScoreDimension["key"], score: number): ScoreDimension {
  return { key, label: key, score, weight: 1 };
}

function baseReport(): AnalysisReport {
  return {
    id: "opportunity-test",
    ticker: "OPP",
    companyName: "Opportunity AB",
    analysisType: "deep",
    investmentProfile: "balanced",
    generatedAt: "2026-09-02T08:00:00.000Z",
    summary: "",
    recommendation: "Hold",
    shortTermAssessment: "",
    longTermAssessment: "",
    metrics: {
      revenueGrowth1y: 0.2,
      revenueCagr3y: 0.14,
      epsGrowth1y: 0.24,
      grossMargin: 0.5,
      operatingMargin: 0.2,
      netMargin: 0.14,
      fcf: 120,
      fcfMargin: 0.16,
      cashConversion: 0.95,
      debtToEquity: 0.15,
      debtToAssets: 0.12,
      netDebt: -80,
      interestCoverage: 15,
      earningsYield: 0.055,
      fcfYield: 0.05,
      priceMomentum1y: 0.22,
      priceMomentum3m: 0.1,
    },
    score: {
      score: 84,
      personalizedScore: 85,
      confidence: 91,
      missingData: [],
      dimensions: [
        dimension("growth", 86), dimension("profitability", 88), dimension("financialHealth", 90),
        dimension("valuation", 82), dimension("cashFlow", 84), dimension("earningsQuality", 80),
        dimension("quality", 87), dimension("momentum", 74), dimension("risk", 85),
      ],
    },
    dcf: { suitable: true, bear: 82, base: 125, bull: 155, assumptions: { startingFcf: 120, years: 5, growthRate: 0.12, discountRate: 0.1, terminalGrowthRate: 0.025, marginOfSafety: 0.2 } },
    redFlags: [],
    greenFlags: [],
    scenarios: [],
    sources: [],
    market: { ticker: "OPP", price: 90, currency: "SEK", date: "2026-09-02", volume: 100000, yearHigh: 100, yearLow: 55, performance: { "3M": 0.1, "1Y": 0.22 } },
    forwardEstimates: { nextYearRevenueGrowth: 0.2, nextYearEpsGrowth: 0.27 },
    providerDiagnostics: [{ provider: "twelve-data", capability: "estimates", status: "available", observedAt: "2026-09-02T08:00:00.000Z" }],
  } as AnalysisReport;
}

describe("buildOpportunityView", () => {
  it("keeps core quality, mispricing and inflection separate while producing a conservative combined opportunity score", () => {
    const result = buildOpportunityView(baseReport());
    expect(result.coreQuality.score).toBe(84);
    expect(result.mispricing.score).not.toBeNull();
    expect(result.inflection.score).not.toBeNull();
    expect(result.opportunityScore).not.toBeNull();
    expect(result.opportunityScore as number).toBeLessThanOrEqual(Math.max(result.coreQuality.score ?? 0, result.mispricing.score ?? 0, result.inflection.score ?? 0));
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("does not produce high-conviction opportunity when one pillar is unavailable", () => {
    const report = baseReport();
    report.market = undefined;
    report.dcf = { suitable: false, bear: null, base: null, bull: null };
    report.score.dimensions = report.score.dimensions.filter((item) => item.key !== "valuation");
    const result = buildOpportunityView(report);
    expect(result.confidence).toBeLessThan(0.85);
    expect(result.missingPillars.length).toBeGreaterThan(0);
  });
});
