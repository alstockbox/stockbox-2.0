import { describe, expect, it } from "vitest";
import { historicalFinancialsCsv } from "../../src/lib/analysis/financial-data-export";
import type { HistoricalPriceWindowStats, HistoricalResearchData } from "../../src/lib/analysis/types";

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

function priceWindow(requestedYears: 1 | 3 | 5 | 10 | null, spanYears: number, sufficientHistory: boolean): HistoricalPriceWindowStats {
  return {
    requestedYears,
    firstDate: "2021-01-01",
    lastDate: "2026-01-01",
    spanYears,
    sufficientHistory,
    observationCount: 60,
    low: 30,
    high: 50,
    currentVsLow: 0.33,
    currentVsHigh: -0.2,
  };
}

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

  it("exports coverage, price and dividend contexts with versions and missing values kept blank", () => {
    const csv = historicalFinancialsCsv({
      ...historical,
      coverage: {
        methodVersion: "historical-coverage-v1",
        financials: { requestedYears: 10, availableYears: 6, observationCount: 6, status: "partial" },
        price: { requestedYears: 10, availableYears: 10, observationCount: 120, status: "full" },
        valuation: { requestedYears: 10, availableYears: 5, observationCount: 54, status: "partial" },
        dividend: { requestedYears: 10, availableYears: 5, observationCount: 20, status: "partial", eventCoverageYears: 5 },
      },
      priceContext: {
        currentPrice: 40,
        currentPriceDate: "2026-01-01",
        yearHigh: 50,
        yearLow: 30,
        distanceToYearHigh: -0.2,
        distanceFromYearLow: 0.33,
        yearRangeSource: "price_history",
        oneYear: priceWindow(1, 1, true),
        threeYear: priceWindow(3, 3, true),
        fiveYear: priceWindow(5, 5, true),
        tenYear: priceWindow(10, 5, false),
        maximum: priceWindow(null, 5, true),
      },
      dividendContext: {
        methodVersion: "dividend-context-v1",
        status: "partial",
        trailingDividendsPerShare: 1.2,
        currentDividendYield: 0.03,
        paymentCountTtm: 4,
        paymentFrequency: "quarterly",
        latestPaymentDate: "2025-12-15",
        latestPaymentAmount: null,
        latestPaymentCurrency: "USD",
        increaseStreakYears: 4,
        safety: "covered",
        annualHistoryYears: 5,
        eventCoverageYears: 5,
      },
    });

    expect(csv).toContain("historicalCoverage");
    expect(csv).toContain("methodVersion,historical-coverage-v1");
    expect(csv).toContain("financials,10,6,6,partial,");
    expect(csv).toContain("historicalPriceContext");
    expect(csv).toContain("tenYear,10,2021-01-01,2026-01-01,5,false");
    expect(csv).toContain("historicalDividendContext");
    expect(csv).toContain("paymentFrequency,quarterly");
    expect(csv).toContain("latestPaymentAmount,");
    expect(csv).not.toContain("undefined");
    expect(csv).not.toContain("NaN");
  });
});
