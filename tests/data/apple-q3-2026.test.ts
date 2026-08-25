import { describe, expect, it } from "vitest";
import { analyzeFinancials, computeFinancialMetrics } from "../../src/lib/analysis";
import { ttmPeriodBasisCheck } from "../../src/lib/analysis/reconciliation";
import type { FinancialAnalysisInput, FinancialPeriod } from "../../src/lib/analysis/types";
import { resolveSecFinancialPeriods } from "../../src/lib/data/sec";
import { appleQ3CompanyFacts } from "./fixtures/apple-q3-2026-companyfacts";

function appleInput(): FinancialAnalysisInput {
  const periods = resolveSecFinancialPeriods(appleQ3CompanyFacts);
  return {
    company: {
      ticker: "AAPL",
      name: "Apple Inc.",
      sector: "technology",
      investmentProfile: "balanced",
      currency: "USD",
    },
    ...periods,
    analysisDate: "2026-08-01T00:00:00.000Z",
  };
}

describe("Apple Q3 2026 Companyfacts regression", () => {
  it("builds one coherent 9M-based current and prior TTM period", () => {
    const input = appleInput();
    const current = input.trailingTwelveMonths;
    const prior = input.priorTrailingTwelveMonths;

    expect(current).toEqual(expect.objectContaining({
      periodEndDate: "2026-06-27",
      balanceSheetDate: "2026-06-27",
      periodBasis: "TTM_Q3_9M",
      revenue: 466_823_000_000,
      grossProfit: 227_123_000_000,
      operatingIncome: 154_859_000_000,
      netIncome: 128_930_000_000,
      operatingCashFlow: 146_724_000_000,
      capitalExpenditures: 10_041_000_000,
      currentSharesOutstanding: 14_594_180_000,
    }));
    expect(current?.provenance?.currentSharesOutstanding).toEqual(expect.objectContaining({
      concept: "EntityCommonStockSharesOutstanding", periodEnd: "2026-07-17", accession: "q3-2026-ytd",
    }));
    expect(prior).toEqual(expect.objectContaining({
      periodEndDate: "2025-06-28",
      balanceSheetDate: "2025-06-28",
      periodBasis: "TTM_Q3_9M",
      revenue: 408_625_000_000,
    }));
    expect(current?.revenue).not.toBe(431_542_000_000);
    expect(ttmPeriodBasisCheck(current)).toEqual(expect.objectContaining({ status: "pass" }));
  });

  it("uses current quarter balances and prior comparable TTM growth", () => {
    const metrics = computeFinancialMetrics(appleInput());
    const latest = metrics.latestPeriod;

    expect(metrics.cashFlow.simpleFreeCashFlow).toBe(136_683_000_000);
    expect(metrics.margins.grossMargin).toBeCloseTo(0.48653, 4);
    expect(metrics.margins.operatingMargin).toBeCloseTo(0.33173, 4);
    expect(metrics.margins.netMargin).toBeCloseTo(0.27619, 4);
    expect(metrics.margins.freeCashFlowMargin).toBeCloseTo(0.29279, 4);
    expect(metrics.cashFlow.freeCashFlowToNetIncome).toBeCloseTo(1.0601, 3);
    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.1424, 3);
    expect(metrics.growth.freeCashFlowGrowthYoY).toBeCloseTo(0.4211, 3);
    expect(metrics.growth.revenueGrowthBasis).toBe("TTM_YOY");
    expect(metrics.growth.freeCashFlowGrowthBasis).toBe("TTM_YOY");

    expect(latest).toEqual(expect.objectContaining({
      totalAssets: 383_266_000_000,
      totalLiabilities: 275_746_000_000,
      totalEquity: 107_520_000_000,
      cashAndEquivalents: 39_544_000_000,
      currentAssets: 149_818_000_000,
      currentLiabilities: 149_326_000_000,
      totalDebt: 84_344_000_000,
    }));
    expect(metrics.ratios.debtToEquity).toBeCloseTo(0.7844, 3);
    expect((latest?.totalDebt ?? 0) / (latest?.totalAssets ?? 1)).toBeCloseTo(0.2201, 3);
    expect(metrics.ratios.netDebt).toBe(44_800_000_000);
    expect(metrics.ratios.currentRatio).toBeCloseTo(1.0033, 3);
    expect(metrics.margins.grossMargin).not.toBeCloseTo(0.478, 2);
    expect(metrics.margins.freeCashFlowMargin).not.toBeCloseTo(0.317, 2);
    expect(metrics.cashFlow.freeCashFlowToNetIncome).not.toBeCloseTo(1.15, 2);
    expect(metrics.ratios.debtToEquity).not.toBeCloseTo(1.34, 1);
    expect(metrics.ratios.netDebt).not.toBe(62_700_000_000);
  });

  it("aligns TTM ROE, ROA and ROIC to current and prior-year instant balances", () => {
    const metrics = computeFinancialMetrics(appleInput());
    const expectedAverageEquity = (107.520 + 65.935) / 2;
    const expectedAverageAssets = (383.266 + 331.495) / 2;
    const currentCapital = 84.344 + 107.520 - 39.544;
    const priorCapital = 97.196 + 65.935 - 36.269;

    expect(metrics.ratios.returnOnEquity).toBeCloseTo(128.930 / expectedAverageEquity, 5);
    expect(metrics.ratios.returnOnAssets).toBeCloseTo(128.930 / expectedAverageAssets, 5);
    expect(metrics.ratios.returnOnInvestedCapital).toBeCloseTo((154.859 * 0.79) / ((currentCapital + priorCapital) / 2), 5);
  });

  it("detects mixed construction bases before ratios or scores are trusted", () => {
    const period: FinancialPeriod = {
      form: "TTM",
      periodEndDate: "2026-06-27",
      periodBasis: "TTM_Q3_9M",
      revenue: 1,
      netIncome: 1,
      operatingCashFlow: 1,
      capitalExpenditures: 1,
      provenance: {
        revenue: { source: "fixture", valueKind: "derived", periodBasis: "TTM_Q1_3M", currentYtdDurationDays: 90 },
        netIncome: { source: "fixture", valueKind: "derived", periodBasis: "TTM_Q1_3M", currentYtdDurationDays: 90 },
        operatingCashFlow: { source: "fixture", valueKind: "derived", periodBasis: "TTM_Q3_9M", currentYtdDurationDays: 272 },
        capitalExpenditures: { source: "fixture", valueKind: "derived", periodBasis: "TTM_Q3_9M", currentYtdDurationDays: 272 },
      },
    };

    expect(ttmPeriodBasisCheck(period)).toEqual(expect.objectContaining({
      code: "ttm_period_basis_consistency",
      status: "warning",
    }));

    const result = analyzeFinancials({
      company: { ticker: "MIX", name: "Mixed Period Inc.", investmentProfile: "balanced" },
      annualPeriods: [{ form: "10-K", periodEndDate: "2025-12-31", revenue: 100, netIncome: 10, operatingCashFlow: 12, capitalExpenditures: 2 }],
      trailingTwelveMonths: period,
      analysisDate: "2026-08-01T00:00:00.000Z",
    });
    expect(result.metrics.latestPeriod).toEqual(expect.objectContaining({ form: "10-K", revenue: 100 }));
    expect(result.diagnostics.ttmStatus).toBe("annual_fallback");
    expect(result.reconciliation).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ttm_period_basis_consistency", status: "warning" }),
    ]));
  });
});
