import { describe, expect, it } from "vitest";
import type { AnalysisReport } from "../../src/lib/analysis/types";
import { buildAlphaPredictionRecord } from "../../src/lib/alpha/prediction-snapshot";

function minimalReport(): AnalysisReport {
  return {
    id: "analysis-1",
    ticker: "BOX",
    companyName: "Box Systems",
    analysisType: "research",
    investmentProfile: "balanced",
    generatedAt: "2026-09-01T12:00:00.000Z",
    oneSentence: "fixture",
    summary: "fixture",
    recommendation: "Buy",
    shortTermAssessment: "fixture",
    longTermAssessment: "fixture",
    metrics: {
      revenueGrowth1y: 0.18, revenueCagr3y: 0.12, epsGrowth1y: 0.25,
      grossMargin: 0.62, operatingMargin: 0.14, netMargin: 0.10,
      fcf: 120, fcfMargin: 0.11, cashConversion: 1.1,
      debtToEquity: 0.25, debtToAssets: 0.18, netDebt: 40, interestCoverage: 10,
      earningsYield: 0.07, fcfYield: 0.075, priceMomentum1y: 0.25, priceMomentum3m: 0.11,
    },
    score: { score: 81, personalizedScore: 82, confidence: 88, dimensions: [], missingData: [] },
    dcf: { suitable: true, bear: 20, base: 30, bull: 40 },
    redFlags: [], greenFlags: [], scenarios: [], sources: [], disclaimer: "fixture",
    modelVersion: "fundamental-7",
    reportSchemaVersion: "7",
    analysisArchetype: "standard",
    dataCoverage: 90,
    dataStatus: "current",
    reportingCurrency: "USD",
    market: {
      ticker: "BOX", price: 25, currency: "USD", date: "2026-09-01", volume: 150_000,
      yearHigh: 31, yearLow: 15, marketCap: 900_000_000, marketCapCurrency: "USD",
      performance: { "1M": 0.04, "3M": 0.11, "6M": 0.18, "1Y": 0.25 },
    },
    historical: {
      financials: [
        { fiscalYear: 2023, periodEndDate: "2023-12-31", currency: "USD", revenue: 100, revenueGrowth: 0.05, eps: 1, epsGrowth: 0.05, netIncome: 10, freeCashFlow: 8, freeCashFlowPerShare: 0.8, freeCashFlowMargin: 0.08, grossMargin: 0.55, operatingMargin: 0.08, netMargin: 0.1, returnOnEquity: 0.1, returnOnAssets: 0.05, returnOnInvestedCapital: 0.08, cash: 10, totalDebt: 5, netDebt: -5, debtToEquity: 0.2, currentRatio: 1.5, interestCoverage: 8, sharesOutstanding: 10, shareGrowth: 0.02, dividendsPaid: 0, dividendPerShare: 0, dividendGrowth: null, payoutRatio: null, freeCashFlowPayoutRatio: null, referencePrice: null, priceEarnings: null, dividendYield: null },
        { fiscalYear: 2024, periodEndDate: "2024-12-31", currency: "USD", revenue: 112, revenueGrowth: 0.12, eps: 1.2, epsGrowth: 0.20, netIncome: 12, freeCashFlow: 11, freeCashFlowPerShare: 1.08, freeCashFlowMargin: 0.10, grossMargin: 0.58, operatingMargin: 0.11, netMargin: 0.11, returnOnEquity: 0.12, returnOnAssets: 0.06, returnOnInvestedCapital: 0.1, cash: 12, totalDebt: 5, netDebt: -7, debtToEquity: 0.18, currentRatio: 1.7, interestCoverage: 9, sharesOutstanding: 10.2, shareGrowth: 0.02, dividendsPaid: 0, dividendPerShare: 0, dividendGrowth: null, payoutRatio: null, freeCashFlowPayoutRatio: null, referencePrice: null, priceEarnings: null, dividendYield: null },
        { fiscalYear: 2025, periodEndDate: "2025-12-31", currency: "USD", revenue: 132, revenueGrowth: 0.18, eps: 1.5, epsGrowth: 0.25, netIncome: 15, freeCashFlow: 15, freeCashFlowPerShare: 1.46, freeCashFlowMargin: 0.11, grossMargin: 0.62, operatingMargin: 0.14, netMargin: 0.11, returnOnEquity: 0.14, returnOnAssets: 0.07, returnOnInvestedCapital: 0.12, cash: 15, totalDebt: 5, netDebt: -10, debtToEquity: 0.16, currentRatio: 1.9, interestCoverage: 10, sharesOutstanding: 10.25, shareGrowth: 0.005, dividendsPaid: 0, dividendPerShare: 0, dividendGrowth: null, payoutRatio: null, freeCashFlowPayoutRatio: null, referencePrice: null, priceEarnings: null, dividendYield: null },
      ],
      price: [], revenueCagr3y: 0.12, revenueCagr5y: null, revenueCagr10y: null,
      epsCagr3y: 0.18, epsCagr5y: null, epsCagr10y: null,
      dividendCagr3y: null, dividendCagr5y: null, dividendCagr10y: null,
      dividendYearsIncreased: 0, dividendYearsUnchanged: 0, dividendYearsCut: 0,
    },
    forwardEstimates: { nextYearRevenueGrowth: 0.20, nextYearEpsGrowth: 0.30, nextYearFreeCashFlowGrowth: 0.24 },
  };
}

describe("alpha prediction snapshot", () => {
  it("captures a separate Alpha result without mutating StockBox fundamental scoring", () => {
    const report = minimalReport();
    const fundamentalBefore = report.score.score;
    const record = buildAlphaPredictionRecord("analysis-1", report);

    expect(report.score.score).toBe(fundamentalBefore);
    expect(record.fundamentalScore).toBe(81);
    expect(record.sourceReportModelVersion).toBe("fundamental-7");
    expect(record.priceAtPrediction).toBe(25);
    expect(record.marketCapCurrency).toBe("USD");
    expect(record.modelVersion).toMatch(/^alpha-/);
    expect(record.methodology.independentFromFundamentalScore).toBe(true);
  });
});
