import { describe, expect, it } from "vitest";
import { historicalFinancialsCsv } from "../../src/lib/analysis/financial-data-export";
import type { HistoricalResearchData } from "../../src/lib/analysis/types";

const historical: HistoricalResearchData = {
  financials: [
    {
      fiscalYear: 2025,
      periodEndDate: "2025-12-31",
      currency: "USD",
      revenue: 100,
      revenueGrowth: 0.1,
      eps: 2,
      epsGrowth: 0.2,
      netIncome: 20,
      freeCashFlow: 18,
      freeCashFlowPerShare: 1.8,
      freeCashFlowMargin: 0.18,
      grossMargin: 0.6,
      operatingMargin: 0.22,
      netMargin: 0.2,
      returnOnEquity: 0.15,
      returnOnAssets: 0.08,
      returnOnInvestedCapital: 0.13,
      cash: 15,
      totalDebt: 25,
      netDebt: 10,
      debtToEquity: 0.4,
      currentRatio: 1.8,
      interestCoverage: 9,
      sharesOutstanding: 10,
      shareGrowth: -0.02,
      dividendsPaid: -4,
      dividendPerShare: 0.4,
      dividendGrowth: 0.05,
      payoutRatio: 0.2,
      freeCashFlowPayoutRatio: 0.22,
      referencePrice: 40,
      priceEarnings: 20,
      dividendYield: 0.01,
    },
  ],
  price: [],
  revenueCagr3y: null,
  revenueCagr5y: null,
  revenueCagr10y: null,
  epsCagr3y: null,
  epsCagr5y: null,
  epsCagr10y: null,
  dividendCagr3y: null,
  dividendCagr5y: null,
  dividendCagr10y: null,
  dividendYearsIncreased: 0,
  dividendYearsUnchanged: 0,
  dividendYearsCut: 0,
};

describe("historical financial CSV export", () => {
  it("exports auditable historical financial rows without replacing missing values", () => {
    const csv = historicalFinancialsCsv({
      ...historical,
      financials: [{ ...historical.financials[0], priceEarnings: null }],
    });

    expect(csv.split("\n")[0]).toContain("fiscalYear,periodEndDate,currency,revenue");
    expect(csv).toContain("2025,2025-12-31,USD,100");
    expect(csv.split("\n")[0]).toContain("freeCashFlowPayoutRatio,referencePrice");
    expect(csv.split("\n")[0]).not.toContain("priceEarnings");
    expect(csv.split("\n")[0]).not.toContain("dividendYield");
  });
});
