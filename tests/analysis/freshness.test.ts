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

  it("falls back to current annual statements when an old TTM period would falsely mark the company stale", () => {
    const result = analyzeFinancials({
      ...staleNvdaInput,
      annualPeriods: [{
        ...staleNvdaInput.annualPeriods[0],
        fiscalYear: 2025,
        periodEndDate: "2025-12-31",
        balanceSheetDate: "2025-12-31",
      }],
      trailingTwelveMonths: {
        ...staleNvdaInput.annualPeriods[0],
        periodEndDate: "2013-09-30",
        balanceSheetDate: "2013-09-30",
        periodBasis: "TTM_Q3_9M",
      },
    });

    expect(result.dataStatus).toBe("current");
    expect(result.metrics.latestPeriod?.periodEndDate).toBe("2025-12-31");
    expect(result.diagnostics.latestFinancialPeriodEnd).toBe("2025-12-31");
    expect(result.diagnostics.ttmStatus).toBe("annual_fallback");
    expect(result.dataCoverage).toBeGreaterThan(0);
  });

  it("falls back to current annual statements when fresh TTM flows depend on a stale interim balance sheet", () => {
    const annual = {
      ...staleNvdaInput.annualPeriods[0],
      fiscalYear: 2025,
      periodEndDate: "2025-12-31",
      balanceSheetDate: "2025-12-31",
    };
    const result = analyzeFinancials({
      ...staleNvdaInput,
      analysisDate: "2026-08-27T00:00:00.000Z",
      annualPeriods: [annual],
      trailingTwelveMonths: {
        ...annual,
        fiscalYear: 2026,
        form: "TTM",
        periodBasis: "TTM_REPORTED",
        periodEndDate: "2026-06-30",
        balanceSheetDate: "2025-12-31",
        provenance: Object.fromEntries([
          "revenue", "grossProfit", "operatingIncome", "netIncome", "operatingCashFlow", "capitalExpenditures",
        ].map((field) => [field, { source: "test", periodBasis: "TTM_REPORTED", valueKind: "reported" as const }])),
      },
    });

    expect(result.dataStatus).toBe("current");
    expect(result.metrics.latestPeriod?.periodEndDate).toBe("2025-12-31");
    expect(result.diagnostics.latestFinancialPeriodEnd).toBe("2025-12-31");
    expect(result.diagnostics.ttmStatus).toBe("annual_fallback");
    expect(result.dataCoverage).toBeGreaterThan(0);
  });

  it("tracks explicit freshness thresholds independently by data domain", () => {
    const current = assessDataFreshness({
      ...staleNvdaInput,
      annualPeriods: [{ ...staleNvdaInput.annualPeriods[0], periodEndDate: "2026-01-25", balanceSheetDate: "2026-01-25" }],
      market: { price: 100, priceDate: "2026-07-01" },
    });

    expect(DATA_FRESHNESS_THRESHOLDS_DAYS).toEqual({
      financialFlow: 220,
      balanceSheet: 220,
      annualFinancialFlow: 455,
      annualBalanceSheet: 455,
      marketPrice: 10,
      marketCap: 10,
      sharesOutstanding: 180,
    });
    expect(current.dataStatus).toBe("current");
    expect(current.financialFlowStatus).toBe("current");
    expect(current.balanceSheetStatus).toBe("current");
    expect(current.marketPriceStatus).toBe("stale");
  });

  it("treats future-dated market prices as unavailable instead of current", () => {
    const freshness = assessDataFreshness({
      ...staleNvdaInput,
      annualPeriods: [{ ...staleNvdaInput.annualPeriods[0], periodEndDate: "2026-01-25", balanceSheetDate: "2026-01-25" }],
      market: { price: 100, priceDate: "2026-09-15" },
    });

    expect(freshness.marketPriceAgeDays).toBeNull();
    expect(freshness.marketPriceStatus).toBe("unavailable");
  });
});

it("marks reported TTM/interim financials older than the current-reporting window as stale", () => {
  const freshness = assessDataFreshness({
    ...staleNvdaInput,
    analysisDate: "2026-08-27T00:00:00.000Z",
    annualPeriods: [{ ...staleNvdaInput.annualPeriods[0], fiscalYear: 2025, periodEndDate: "2025-12-31", balanceSheetDate: "2025-12-31" }],
    trailingTwelveMonths: {
      ...staleNvdaInput.annualPeriods[0], fiscalYear: 2025, form: "TTM",
      periodBasis: "TTM_REPORTED", periodEndDate: "2025-12-31", balanceSheetDate: "2025-12-31",
    },
  });
  expect(freshness.financialFlowAgeDays).toBe(239);
  expect(freshness.financialFlowStatus).toBe("stale");
  expect(freshness.dataStatus).toBe("stale");
});

it("keeps a 149-day reported interim period current", () => {
  const freshness = assessDataFreshness({
    ...staleNvdaInput,
    analysisDate: "2026-08-27T00:00:00.000Z",
    annualPeriods: [],
    trailingTwelveMonths: { ...staleNvdaInput.annualPeriods[0], form: "TTM", periodBasis: "TTM_REPORTED", periodEndDate: "2026-03-31", balanceSheetDate: "2026-03-31" },
  });
  expect(freshness.financialFlowAgeDays).toBe(149);
  expect(freshness.dataStatus).toBe("current");
});
