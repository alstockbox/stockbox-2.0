import { describe, expect, it } from "vitest";
import { mispricingInputFromReport } from "@/lib/analysis/intelligence-snapshot";

describe("intelligence benchmark wiring", () => {
  it("feeds the versioned sector benchmark valuation score into mispricing", () => {
    const report = {
      score: { score: 70, personalizedScore: 70, confidence: 80, dimensions: [{ key: "valuation", label: "Valuation", score: 72, weight: 1 }], missingData: [] },
      dcf: { suitable: false, bear: null, base: null, bull: null },
      redFlags: [], metrics: { revenueGrowth1y: null, epsGrowth1y: null, fcfMargin: null, operatingMargin: null, cashConversion: null, debtToEquity: null, interestCoverage: null },
      engine: {
        analysisArchetype: "standard",
        metrics: { valuation: { priceEarnings: 14, evEbitda: 8, evSales: 2, freeCashFlowYield: 0.08 }, growth: {}, margins: {}, ratios: {} },
        scores: { sector: "technology", methodology: { benchmarkVersion: "fixture" } },
        dcf: { scenarios: [] }, sourceConflicts: [],
      },
      historical: { financials: [], price: [] }, dataStatus: "current",
    } as never;
    const input = mispricingInputFromReport(report);
    expect(input.benchmarkValuationScore).not.toBeNull();
  });
});
