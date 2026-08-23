import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { assessDataFreshness, DATA_FRESHNESS_THRESHOLDS_DAYS } from "../../src/lib/analysis/freshness";
import type { FinancialAnalysisInput } from "../../src/lib/analysis/types";

const staleNvdaInput: FinancialAnalysisInput = {
  company: { ticker: "NVDA", name: "NVIDIA Corporation", investmentProfile: "balanced" },
  analysisDate: "2026-08-23T00:00:00.000Z",
  annualPeriods: [{
    fiscalYear: 2012,
    form: "10-K",
    periodEndDate: "2012-01-29",
    balanceSheetDate: "2012-01-29",
    revenue: 4_000,
    grossProfit: 2_000,
    operatingIncome: 700,
    netIncome: 500,
    operatingCashFlow: 650,
    capitalExpenditures: 100,
    totalAssets: 5_000,
    totalLiabilities: 2_000,
    totalEquity: 3_000,
  }],
};

describe("hard data freshness gate", () => {
  it("blocks stale 2012 NVDA fundamentals from producing a current rating", () => {
    const result = analyzeFinancials(staleNvdaInput);

    expect(result.dataStatus).toBe("stale");
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.scores.shortTermScore).toBeNull();
    expect(result.scores.longTermScore).toBeNull();
    expect(result.metrics.latestPeriod).toBeNull();
    expect(result.scenarios).toEqual([]);
    expect(result.scores.dimensions.growth.score).toBeNull();
    expect(result.scores.dimensions.profitability.score).toBeNull();
    expect(result.missingData).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "staleFinancialData", severity: "high" }),
    ]));
  });

  it("tracks explicit freshness thresholds independently by data domain", () => {
    const current = assessDataFreshness({
      ...staleNvdaInput,
      annualPeriods: [{ ...staleNvdaInput.annualPeriods[0], periodEndDate: "2026-01-25", balanceSheetDate: "2026-01-25" }],
      market: { price: 100, priceDate: "2026-07-01" },
    });

    expect(DATA_FRESHNESS_THRESHOLDS_DAYS).toEqual({ financialFlow: 550, balanceSheet: 550, marketPrice: 10 });
    expect(current.dataStatus).toBe("current");
    expect(current.financialFlowStatus).toBe("current");
    expect(current.balanceSheetStatus).toBe("current");
    expect(current.marketPriceStatus).toBe("stale");
  });
});
