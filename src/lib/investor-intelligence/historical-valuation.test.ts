import { describe, expect, it } from "vitest";
import { buildHistoricalValuationSummary, calculateValuationStatistics } from "./historical-valuation";
import type { HistoricalFinancialPoint } from "@/lib/analysis/types";

function point(year: number, overrides: Partial<HistoricalFinancialPoint> = {}): HistoricalFinancialPoint {
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    currency: "USD",
    revenue: 1000,
    revenueGrowth: null,
    eps: 5,
    epsGrowth: null,
    netIncome: 100,
    freeCashFlow: 100,
    freeCashFlowPerShare: 5,
    freeCashFlowMargin: 0.1,
    grossMargin: 0.6,
    operatingMargin: 0.25,
    netMargin: 0.1,
    returnOnEquity: 0.2,
    returnOnAssets: 0.1,
    returnOnInvestedCapital: 0.15,
    cash: 100,
    totalDebt: 50,
    netDebt: -50,
    debtToEquity: 0.2,
    currentRatio: 2,
    interestCoverage: 10,
    sharesOutstanding: 100,
    shareGrowth: null,
    dividendsPaid: 20,
    dividendPerShare: 1,
    dividendGrowth: null,
    payoutRatio: 0.2,
    freeCashFlowPayoutRatio: 0.2,
    referencePrice: 100,
    priceEarnings: 20,
    dividendYield: 0.01,
    ...overrides,
  };
}

describe("historical valuation statistics", () => {
  it("calculates deterministic median, quartiles and current percentile", () => {
    const stats = calculateValuationStatistics(
      [10, 15, 20, 25, 30].map((value, index) => ({ year: 2021 + index, value })),
      17.5,
    );

    expect(stats?.median).toBe(20);
    expect(stats?.min).toBe(10);
    expect(stats?.max).toBe(30);
    expect(stats?.p25).toBe(15);
    expect(stats?.p75).toBe(25);
    expect(stats?.currentPercentile).toBeCloseTo(0.4);
    expect(stats?.differenceVsMedian).toBeCloseTo(-0.125);
  });

  it("derives only financially supportable historical multiples from stored fundamentals", () => {
    const history = [
      point(2023, { referencePrice: 80, priceEarnings: 16, freeCashFlowPerShare: 4, dividendYield: 0.012 }),
      point(2024, { referencePrice: 90, priceEarnings: 18, freeCashFlowPerShare: 4.5, dividendYield: 0.011 }),
      point(2025, { referencePrice: 100, priceEarnings: 20, freeCashFlowPerShare: 5, dividendYield: 0.01 }),
    ];

    const summary = buildHistoricalValuationSummary({
      financials: history,
      current: { pe: 17, ps: 9, fcfYield: 0.06, dividendYield: 0.013 },
    });

    expect(summary.metrics.pe.samples).toHaveLength(3);
    expect(summary.metrics.pFcf.samples.map((sample) => sample.value)).toEqual([20, 20, 20]);
    expect(summary.metrics.fcfYield.samples.map((sample) => sample.value)).toEqual([0.05, 0.05, 0.05]);
    expect(summary.metrics.ps.samples[0]?.value).toBeCloseTo(8);
    expect(summary.metrics.dividendYield.samples[0]?.value).toBeCloseTo(0.012);
  });

  it("reports 10Y as unavailable when only five annual observations exist", () => {
    const history = Array.from({ length: 5 }, (_, index) => point(2021 + index, { priceEarnings: 15 + index }));
    const summary = buildHistoricalValuationSummary({
      financials: history,
      current: { pe: 20, ps: null, fcfYield: null, dividendYield: null },
    });

    expect(summary.metrics.pe.windows.fiveYear).not.toBeNull();
    expect(summary.metrics.pe.windows.tenYear).toBeNull();
    expect(summary.metrics.pe.availableYears).toBe(5);
  });

  it("does not fabricate a historical value when a required input is missing or non-positive", () => {
    const history = [point(2025, { freeCashFlowPerShare: null }), point(2024, { freeCashFlowPerShare: -2 })];
    const summary = buildHistoricalValuationSummary({
      financials: history,
      current: { pe: null, ps: null, fcfYield: 0.05, dividendYield: null },
    });

    expect(summary.metrics.pFcf.samples).toEqual([]);
    expect(summary.metrics.fcfYield.samples).toEqual([]);
  });
});
