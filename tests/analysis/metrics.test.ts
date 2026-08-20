import { describe, expect, it } from "vitest";
import { computeFinancialMetrics } from "../../src/lib/analysis";
import { durableCompounderInput, missingDataInput } from "./fixtures";

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
    expect(metrics.ratios.returnOnInvestedCapital).toBeCloseTo((312 * 0.79) / (220 + 620 - 180), 5);
    expect(metrics.ratios.cashConversion).toBeCloseTo(260 / 240, 5);

    expect(metrics.valuation.priceEarnings).toBeCloseTo(3060 / 240, 5);
    expect(metrics.valuation.evEbitda).toBeCloseTo(3100 / 372, 5);
    expect(metrics.valuation.freeCashFlowYield).toBeCloseTo(260 / 3060, 5);
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
});
