import { describe, expect, it } from "vitest";
import { computeDiscountedCashFlow } from "../../src/lib/analysis/dcf";
import { adjustedDcfAssumptions, runInteractiveValuation } from "../../src/lib/analysis/interactive-valuation";
import type { DiscountedCashFlowAssumptions } from "../../src/lib/analysis/types";

const baseAssumptions: DiscountedCashFlowAssumptions = {
  baseFreeCashFlow: 100,
  forecastYears: 5,
  discountRate: 0.1,
  terminalGrowthRate: 0.025,
  fcfGrowthRates: [0.08, 0.065, 0.05, 0.04, 0.03],
  netDebt: 50,
  sharesOutstanding: 20,
};

describe("interactive valuation model", () => {
  it("uses the canonical deterministic DCF formula for the unchanged base case", () => {
    const expected = computeDiscountedCashFlow(baseAssumptions);
    const result = runInteractiveValuation({
      baseAssumptions,
      growthAdjustment: 0,
      discountRate: baseAssumptions.discountRate,
      terminalGrowthRate: baseAssumptions.terminalGrowthRate,
    });

    expect(result?.perShareValue).toBeCloseTo(expected.perShareValue, 2);
    expect(result?.enterpriseValue).toBeCloseTo(expected.enterpriseValue, 2);
  });

  it("raises fair value when growth assumptions improve and lowers it when discount rate rises", () => {
    const base = runInteractiveValuation({
      baseAssumptions,
      growthAdjustment: 0,
      discountRate: 0.1,
      terminalGrowthRate: 0.025,
    });
    const growthUp = runInteractiveValuation({
      baseAssumptions,
      growthAdjustment: 0.02,
      discountRate: 0.1,
      terminalGrowthRate: 0.025,
    });
    const discountUp = runInteractiveValuation({
      baseAssumptions,
      growthAdjustment: 0,
      discountRate: 0.13,
      terminalGrowthRate: 0.025,
    });

    expect(growthUp?.perShareValue).toBeGreaterThan(base?.perShareValue ?? 0);
    expect(discountUp?.perShareValue).toBeLessThan(base?.perShareValue ?? Number.POSITIVE_INFINITY);
  });

  it("clamps terminal growth below discount rate", () => {
    const assumptions = adjustedDcfAssumptions({
      baseAssumptions,
      growthAdjustment: 0,
      discountRate: 0.06,
      terminalGrowthRate: 0.05,
    });

    expect(assumptions.terminalGrowthRate).toBeLessThan(assumptions.discountRate);
    expect(assumptions.terminalGrowthRate).toBeLessThanOrEqual(0.04);
  });

  it("fails closed instead of producing a value for invalid scenario assumptions", () => {
    const result = runInteractiveValuation({
      baseAssumptions: { ...baseAssumptions, fcfGrowthRates: [0.1] },
      growthAdjustment: 0,
      discountRate: 0.1,
      terminalGrowthRate: 0.025,
    });

    expect(result).toBeNull();
  });
});
