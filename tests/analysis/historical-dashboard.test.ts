import { describe, expect, it } from "vitest";
import type { HistoricalFinancialPoint } from "../../src/lib/analysis/types";
import { buildGrowthDashboardRows, buildMarginDashboardRows } from "../../src/lib/analysis/historical-dashboard";

function point(year: number, revenue: number, operatingMargin: number): HistoricalFinancialPoint {
  const operatingIncome = revenue * operatingMargin;
  const netIncome = operatingIncome * 0.7;
  const fcf = netIncome * 1.1;
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    currency: "USD",
    revenue,
    revenueGrowth: null,
    eps: netIncome / 100,
    epsGrowth: null,
    netIncome,
    freeCashFlow: fcf,
    freeCashFlowPerShare: fcf / 100,
    freeCashFlowMargin: fcf / revenue,
    grossMargin: 0.6,
    operatingMargin,
    netMargin: netIncome / revenue,
    returnOnEquity: null,
    returnOnAssets: null,
    returnOnInvestedCapital: null,
    cash: null,
    totalDebt: null,
    netDebt: null,
    debtToEquity: null,
    currentRatio: null,
    interestCoverage: null,
    sharesOutstanding: 100,
    shareGrowth: null,
    dividendsPaid: null,
    dividendPerShare: null,
    dividendGrowth: null,
    payoutRatio: null,
    freeCashFlowPayoutRatio: null,
    referencePrice: null,
    priceEarnings: null,
    dividendYield: null,
  };
}

describe("historical dashboard summaries", () => {
  it("calculates growth windows without filling missing periods", () => {
    const rows = buildGrowthDashboardRows([
      point(2021, 100, 0.1),
      point(2022, 115, 0.12),
      point(2023, 140, 0.16),
      point(2024, 180, 0.22),
    ]);
    const revenue = rows.find((row) => row.key === "revenue");

    expect(revenue?.oneYearGrowth).toBeCloseTo(180 / 140 - 1, 8);
    expect(revenue?.threeYearCagr).toBeCloseTo((180 / 100) ** (1 / 3) - 1, 8);
    expect(revenue?.fiveYearCagr).toBeNull();
    expect(revenue?.classification).toBe("accelerating");
  });

  it("summarizes margins across current and average windows", () => {
    const rows = buildMarginDashboardRows([
      point(2020, 100, 0.1),
      point(2021, 110, 0.12),
      point(2022, 120, 0.14),
      point(2023, 130, 0.16),
      point(2024, 140, 0.18),
    ]);
    const operating = rows.find((row) => row.key === "operatingMargin");

    expect(operating?.current).toBeCloseTo(0.18, 8);
    expect(operating?.oneYearAgo).toBeCloseTo(0.16, 8);
    expect(operating?.threeYearAverage).toBeCloseTo((0.14 + 0.16 + 0.18) / 3, 8);
    expect(operating?.fiveYearAverage).toBeCloseTo(0.14, 8);
  });
});
