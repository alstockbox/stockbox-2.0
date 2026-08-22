import { describe, expect, it } from "vitest";
import { computeFinancialMetrics } from "../../src/lib/analysis";
import { appleFy2025Input, durableCompounderInput, missingDataInput } from "./fixtures";

describe("computeFinancialMetrics", () => {
  it("calculates deterministic margins, growth, ratios and valuation metrics", () => {
    const metrics = computeFinancialMetrics(durableCompounderInput);

    expect(metrics.margins.grossMargin).toBeCloseTo(0.7, 5);
    expect(metrics.margins.operatingMargin).toBeCloseTo(0.26, 5);
    expect(metrics.margins.netMargin).toBeCloseTo(0.2, 5);
    expect(metrics.margins.freeCashFlowMargin).toBeCloseTo(260 / 1200, 5);

    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.2, 5);
    expect(metrics.growth.revenueCagr3y).toBeCloseTo((1200 / 700) ** (1 / 3) - 1, 5);
    expect(metrics.growth.freeCashFlowGrowthYoY).toBeCloseTo((260 / 175) - 1, 5);

    expect(metrics.ratios.currentRatio).toBeCloseTo(470 / 230, 5);
    expect(metrics.ratios.debtToEquity).toBeCloseTo(220 / 620, 5);
    expect(metrics.ratios.netDebt).toBe(40);
    expect(metrics.ratios.netDebtToEbitda).toBeCloseTo(40 / 372, 5);
    expect(metrics.ratios.interestCoverage).toBeCloseTo(312 / 16, 5);
    const currentCapital = 220 + 620 - 180;
    const priorCapital = 200 + 430 - 120;
    expect(metrics.ratios.returnOnInvestedCapital).toBeCloseTo((312 * 0.79) / ((currentCapital + priorCapital) / 2), 5);
    expect(metrics.ratios.cashConversion).toBeCloseTo(260 / 240, 5);

    expect(metrics.valuation.priceEarnings).toBeCloseTo(3060 / 240, 5);
    expect(metrics.valuation.evEbitda).toBeCloseTo(3100 / 372, 5);
    expect(metrics.valuation.freeCashFlowYield).toBeCloseTo(260 / 3060, 5);
  });

  it("reconciles the Apple FY2025 golden financial statement values", () => {
    const metrics = computeFinancialMetrics(appleFy2025Input);

    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.0643, 3);
    expect(metrics.margins.grossMargin).toBeCloseTo(0.4691, 3);
    expect(metrics.margins.operatingMargin).toBeCloseTo(0.3197, 3);
    expect(metrics.margins.netMargin).toBeCloseTo(0.2692, 3);
    expect(metrics.cashFlow.simpleFreeCashFlow).toBe(98_767_000_000);
    expect(metrics.cashFlow.simpleFreeCashFlow).not.toBeCloseTo(124_197_000_000, -6);
    expect(metrics.cashFlow.freeCashFlowToNetIncome).toBeCloseTo(0.882, 3);
    expect(metrics.latestPeriod?.epsDiluted).toBe(7.46);
  });

  it("subtracts capex exactly once for positive and negative provider signs", () => {
    const positive = computeFinancialMetrics({ ...durableCompounderInput, annualPeriods: [{ ...durableCompounderInput.annualPeriods.at(-1)!, capitalExpenditures: 60 }] });
    const negative = computeFinancialMetrics({ ...durableCompounderInput, annualPeriods: [{ ...durableCompounderInput.annualPeriods.at(-1)!, capitalExpenditures: -60 }] });
    expect(positive.cashFlow.simpleFreeCashFlow).toBe(260);
    expect(negative.cashFlow.simpleFreeCashFlow).toBe(260);
  });

  it("does not assume missing debt is zero for net debt or enterprise value", () => {
    const latest = { ...durableCompounderInput.annualPeriods.at(-1)!, totalDebt: null };
    const input = { ...durableCompounderInput, annualPeriods: [latest], market: { ...durableCompounderInput.market, enterpriseValue: null } };
    const metrics = computeFinancialMetrics(input);
    expect(metrics.ratios.netDebt).toBeNull();
    expect(metrics.valuation.enterpriseValue).toBeNull();
  });

  it("reports missing or unsafe denominators instead of producing misleading growth", () => {
    const metrics = computeFinancialMetrics(missingDataInput);

    expect(metrics.growth.revenueGrowthYoY).toBeNull();
    expect(metrics.growth.revenueCagr3y).toBeNull();
    expect(metrics.valuation.marketCap).toBeNull();
    expect(metrics.missingData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "marketCap",
          impact: "metric",
        }),
        expect.objectContaining({
          field: "revenueGrowthYoY",
          impact: "metric",
        }),
      ]),
    );
  });

  it("uses explicit annual growth fallback but no mismatched annual balance for TTM returns", () => {
    const trailingTwelveMonths = {
      ...durableCompounderInput.annualPeriods.at(-1)!,
      form: "TTM",
      periodBasis: "TTM_Q3_9M" as const,
      periodEndDate: "2025-06-30",
      balanceSheetDate: "2025-06-30",
      provenance: {
        revenue: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        grossProfit: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        operatingIncome: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        netIncome: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        operatingCashFlow: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
        capitalExpenditures: { source: "fixture", valueKind: "derived" as const, periodBasis: "TTM_Q3_9M" as const, currentYtdDurationDays: 272 },
      },
    };
    const metrics = computeFinancialMetrics({ ...durableCompounderInput, trailingTwelveMonths });

    expect(metrics.growth.revenueGrowthBasis).toBe("ANNUAL_YOY");
    expect(metrics.growth.revenueGrowthYoY).toBeCloseTo(0.2, 5);
    expect(metrics.ratios.returnOnEquity).toBeNull();
    expect(metrics.ratios.returnOnAssets).toBeNull();
    expect(metrics.ratios.returnOnInvestedCapital).toBeNull();
  });
});
