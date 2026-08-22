import { clamp, round } from "@/lib/utils/format";
import type { AnnualFinancials, DcfAssumptions, DcfRange, Metrics } from "./types";

export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator === 0
  ) {
    return null;
  }

  return numerator / denominator;
}

export function percentChange(current: number | null | undefined, previous: number | null | undefined) {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) {
    return null;
  }

  return current / previous - 1;
}

export function cagr(current: number | null | undefined, previous: number | null | undefined, years: number) {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    years <= 0 ||
    current <= 0 ||
    previous <= 0
  ) {
    return null;
  }

  return current ** (1 / years) / previous ** (1 / years) - 1;
}

export function freeCashFlow(operatingCashFlow: number | null, capex: number | null) {
  if (operatingCashFlow === null || capex === null) return null;
  return operatingCashFlow - Math.abs(capex);
}

export function latestAnnual(annual: AnnualFinancials[]) {
  return [...annual].sort((a, b) => b.fiscalYear - a.fiscalYear)[0] ?? null;
}

export function calculateMetrics(
  annual: AnnualFinancials[],
  marketPrice: number | null,
  marketCap: number | null,
  marketPerformance: Record<string, number | undefined>
): Metrics {
  const sorted = [...annual].sort((a, b) => b.fiscalYear - a.fiscalYear);
  const latest = sorted[0];
  const previous = sorted[1];
  const third = sorted[3] ?? sorted[2];
  const fcf = latest ? freeCashFlow(latest.operatingCashFlow, latest.capex) : null;

  return {
    revenueGrowth1y: latest && previous ? percentChange(latest.revenue, previous.revenue) : null,
    revenueCagr3y: latest && third ? cagr(latest.revenue, third.revenue, latest.fiscalYear - third.fiscalYear) : null,
    epsGrowth1y: latest && previous ? percentChange(latest.epsDiluted, previous.epsDiluted) : null,
    grossMargin: latest ? safeDivide(latest.grossProfit, latest.revenue) : null,
    operatingMargin: latest ? safeDivide(latest.operatingIncome, latest.revenue) : null,
    netMargin: latest ? safeDivide(latest.netIncome, latest.revenue) : null,
    fcf,
    fcfMargin: latest ? safeDivide(fcf, latest.revenue) : null,
    cashConversion: latest ? safeDivide(fcf, latest.netIncome) : null,
    debtToEquity: latest ? safeDivide(latest.debt, latest.equity) : null,
    debtToAssets: latest ? safeDivide(latest.debt, latest.assets) : null,
    netDebt: latest && latest.debt !== null && latest.cash !== null ? latest.debt - latest.cash : null,
    interestCoverage: latest
      ? safeDivide(latest.operatingIncome, latest.interestExpense ? Math.abs(latest.interestExpense) : null)
      : null,
    earningsYield: latest && marketPrice ? safeDivide(latest.epsDiluted, marketPrice) : null,
    fcfYield: marketCap ? safeDivide(fcf, marketCap) : null,
    priceMomentum1y: marketPerformance["1Y"] ?? null,
    priceMomentum3m: marketPerformance["3M"] ?? null
  };
}

export function normalizeHigherBetter(value: number | null, bad: number, excellent: number) {
  if (value === null || Number.isNaN(value)) return null;
  return clamp(((value - bad) / (excellent - bad)) * 100, 0, 100);
}

export function normalizeLowerBetter(value: number | null, excellent: number, bad: number) {
  if (value === null || Number.isNaN(value)) return null;
  return clamp(((bad - value) / (bad - excellent)) * 100, 0, 100);
}

export function weightedAverage(values: Array<{ score: number | null; weight: number }>) {
  const present = values.filter((value) => value.score !== null);
  const totalWeight = present.reduce((sum, value) => sum + value.weight, 0);
  if (totalWeight === 0) return null;
  return present.reduce((sum, value) => sum + value.score! * value.weight, 0) / totalWeight;
}

export function calculateDcf(assumptions: DcfAssumptions): DcfRange {
  const { startingFcf, years, growthRate, discountRate, terminalGrowthRate, marginOfSafety } = assumptions;

  if (
    startingFcf <= 0 ||
    years < 3 ||
    discountRate <= terminalGrowthRate ||
    discountRate <= 0 ||
    terminalGrowthRate < -0.02
  ) {
    return {
      suitable: false,
      reason: "DCF is not suitable with negative cash flow or invalid discount assumptions.",
      bear: null,
      base: null,
      bull: null
    };
  }

  const presentValue = (growth: number, discount: number, terminal: number) => {
    let projectedFcf = startingFcf;
    let value = 0;
    for (let year = 1; year <= years; year += 1) {
      projectedFcf *= 1 + growth;
      value += projectedFcf / (1 + discount) ** year;
    }

    const terminalValue = (projectedFcf * (1 + terminal)) / (discount - terminal);
    value += terminalValue / (1 + discount) ** years;
    return value * (1 - marginOfSafety);
  };

  return {
    suitable: true,
    bear: round(presentValue(growthRate * 0.6, discountRate + 0.015, terminalGrowthRate * 0.7), 0),
    base: round(presentValue(growthRate, discountRate, terminalGrowthRate), 0),
    bull: round(presentValue(growthRate * 1.25, Math.max(discountRate - 0.01, terminalGrowthRate + 0.025), terminalGrowthRate), 0),
    assumptions
  };
}
