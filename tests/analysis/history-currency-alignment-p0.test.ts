import { describe, expect, it } from "vitest";
import { buildAnalysis, type AnalysisInput, type AnalysisReport } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

function inputWithHistory(historyCurrency?: string): AnalysisInput {
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
      priceHistory: [
        { date: "2025-08-29", close: 230, currency: historyCurrency },
        { date: "2026-08-28", close: 300, currency: historyCurrency },
      ],
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

function currencyAlignment(input: AnalysisInput): number | undefined {
  const report = buildAnalysis(input) as AnalysisReport;
  return report.confidenceBreakdown?.currencyAlignment;
}

describe("historical market currency alignment P0", () => {
  it("keeps full alignment when current quote and every historical price use SEK", () => {
    expect(currencyAlignment(inputWithHistory("SEK"))).toBe(100);
  });

  it("fails currency alignment when an SEK listing carries USD historical prices", () => {
    expect(currencyAlignment(inputWithHistory("USD"))).toBe(0);
  });

  it("does not claim 100% alignment when rendered price history has no currency evidence", () => {
    expect(currencyAlignment(inputWithHistory(undefined))).toBeLessThan(100);
  });
});
