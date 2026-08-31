import { computeDiscountedCashFlow } from "./dcf";
import { clamp, isFiniteNumber, round } from "./math";
import type { DiscountedCashFlowAssumptions } from "./types";

export type InteractiveValuationInput = {
  baseAssumptions: DiscountedCashFlowAssumptions;
  growthAdjustment: number;
  discountRate: number;
  terminalGrowthRate: number;
};

export type InteractiveValuationResult = {
  perShareValue: number;
  enterpriseValue: number;
  equityValue: number;
  discountRate: number;
  terminalGrowthRate: number;
  fcfGrowthRates: number[];
};

function rounded(value: number, decimals = 2): number {
  return round(value, decimals) ?? value;
}

export function adjustedDcfAssumptions(input: InteractiveValuationInput): DiscountedCashFlowAssumptions {
  const base = input.baseAssumptions;
  const discountRate = clamp(input.discountRate, 0.04, 0.25);
  const terminalGrowthRate = clamp(input.terminalGrowthRate, -0.02, Math.min(0.04, discountRate - 0.015));
  const growthAdjustment = clamp(input.growthAdjustment, -0.1, 0.1);
  return {
    ...base,
    discountRate,
    terminalGrowthRate,
    fcfGrowthRates: base.fcfGrowthRates.map((growth) => clamp(growth + growthAdjustment, -0.3, 0.45)),
  };
}

export function runInteractiveValuation(input: InteractiveValuationInput): InteractiveValuationResult | null {
  if (
    !Number.isInteger(input.baseAssumptions.forecastYears)
    || input.baseAssumptions.forecastYears < 1
    || input.baseAssumptions.fcfGrowthRates.length !== input.baseAssumptions.forecastYears
    || input.baseAssumptions.fcfGrowthRates.some((growth) => !isFiniteNumber(growth))
  ) {
    return null;
  }
  try {
    const assumptions = adjustedDcfAssumptions(input);
    const result = computeDiscountedCashFlow(assumptions);
    return {
      perShareValue: rounded(result.perShareValue, 2),
      enterpriseValue: rounded(result.enterpriseValue, 2),
      equityValue: rounded(result.equityValue, 2),
      discountRate: assumptions.discountRate,
      terminalGrowthRate: result.assumptions.terminalGrowthRate,
      fcfGrowthRates: assumptions.fcfGrowthRates.map((growth) => rounded(growth, 4)),
    };
  } catch {
    return null;
  }
}
