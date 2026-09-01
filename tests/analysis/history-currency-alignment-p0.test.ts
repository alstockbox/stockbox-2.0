import { describe, expect, it } from "vitest";
import {
  buildAnalysis,
  buildBatchQaResult,
  toFinancialAnalysisInput,
  type AnalysisInput,
  type AnalysisReport,
  type MarketPricePoint,
} from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

function inputWithHistory(historyCurrency?: string): AnalysisInput {
  const priceHistory = [
    { date: "2025-08-29", close: 230, currency: historyCurrency },
    { date: "2026-08-28", close: 300, currency: historyCurrency },
  ] as unknown as MarketPricePoint[];

  return {
    company: {
      ticker: "BOX.ST",
      name: "Box Systems AB",
      country: "SE",
      exchange: "Nasdaq Stockholm",
      currency: "SEK",
    },
    analysisType: "deep",
    investmentProfile: "balanced",
    market: {
      ticker: "BOX.ST",
      price: 300,
      currency: "SEK",
      date: "2026-08-28",
      volume: 1_000,
      yearHigh: 350,
      yearLow: 200,
      marketCap: 30_600,
      marketCapCurrency: "SEK",
      sharesOutstanding: 102,
      priceHistory,
      priceHistoryBasis: "close",
      performance: { "1Y": 0.3043 },
    },
    fundamentals: {
      ticker: "BOX.ST",
      name: "Box Systems AB",
      reportingCurrency: "SEK",
      sector: "technology",
      industry: "Software",
      analysisArchetype: "standard",
      annual: durableCompounderInput.annualPeriods.map((period) => ({
        fiscalYear: period.fiscalYear as number,
        periodEndDate: `${period.fiscalYear}-12-31`,
        revenue: period.revenue ?? null,
        grossProfit: period.grossProfit ?? null,
        operatingIncome: period.operatingIncome ?? null,
        netIncome: period.netIncome ?? null,
        epsDiluted: period.epsDiluted ?? null,
        operatingCashFlow: period.operatingCashFlow ?? null,
        capex: period.capitalExpenditures ?? null,
        assets: period.totalAssets ?? null,
        liabilities: period.totalLiabilities ?? null,
        cash: period.cashAndEquivalents ?? null,
        debt: period.totalDebt ?? null,
        equity: period.totalEquity ?? null,
        interestExpense: period.interestExpense ?? null,
        ebitda: period.ebitda,
        currentAssets: period.currentAssets,
        currentLiabilities: period.currentLiabilities,
        sharesDiluted: period.sharesDiluted,
        currency: "SEK",
      })),
    },
  };
}

function qaFor(input: AnalysisInput) {
  const report = buildAnalysis(input) as AnalysisReport;
  const analysisInput = toFinancialAnalysisInput(input);
  const qa = buildBatchQaResult({
    batchId: "currency-history-p0",
    rerunKey: "currency-history-p0",
    report,
    analysisInput,
  });
  return { report, qa };
}

describe("historical market currency alignment P0", () => {
  it("keeps full alignment when current quote and every historical price use SEK", () => {
    const { report, qa } = qaFor(inputWithHistory("SEK"));
    expect(qa.flags).not.toContain("CURRENCY_MISMATCH");
    expect(report.confidenceBreakdown?.currencyAlignment).toBe(100);
  });

  it("fails currency alignment when an SEK listing carries USD historical prices", () => {
    const { report, qa } = qaFor(inputWithHistory("USD"));
    expect(qa.flags).toContain("CURRENCY_MISMATCH");
    expect(report.confidenceBreakdown?.currencyAlignment).toBe(0);
  });

  it("does not claim 100% alignment when rendered price history has no currency evidence", () => {
    const { report, qa } = qaFor(inputWithHistory(undefined));
    expect(qa.flags).not.toContain("CURRENCY_MISMATCH");
    expect(report.confidenceBreakdown?.currencyAlignment).toBeLessThanOrEqual(25);
  });
});
