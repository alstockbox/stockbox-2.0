import { benchmarksForSector } from "./config";
import type {
  DiscountedCashFlowAssumptions,
  DcfRangeResult,
  DcfScenarioResult,
  DiscountedCashFlowResult,
  FinancialAnalysisInput,
  FinancialMetrics,
  MissingDataItem,
  ScenarioName,
} from "./types";
import { addMissingData, clamp, firstFinite, isFiniteNumber, round } from "./math";
import { computeFinancialMetrics, deriveFreeCashFlow } from "./metrics";

const DEFAULT_FORECAST_YEARS = 5;

export function computeDiscountedCashFlow(
  assumptions: DiscountedCashFlowAssumptions,
): DiscountedCashFlowResult {
  const cashFlows: number[] = [];
  let currentCashFlow = assumptions.baseFreeCashFlow;

  for (let year = 0; year < assumptions.forecastYears; year += 1) {
    const growthRate = assumptions.fcfGrowthRates[year] ?? assumptions.fcfGrowthRates.at(-1) ?? 0;
    currentCashFlow *= 1 + growthRate;
    cashFlows.push(currentCashFlow);
  }

  const presentValueOfCashFlows = cashFlows.reduce(
    (sum, cashFlow, index) => sum + cashFlow / (1 + assumptions.discountRate) ** (index + 1),
    0,
  );
  const finalCashFlow = cashFlows.at(-1) ?? assumptions.baseFreeCashFlow;
  const terminalGrowthRate = Math.min(
    assumptions.terminalGrowthRate,
    assumptions.discountRate - 0.015,
  );
  const terminalValue =
    (finalCashFlow * (1 + terminalGrowthRate)) / (assumptions.discountRate - terminalGrowthRate);
  const presentValueOfTerminalValue =
    terminalValue / (1 + assumptions.discountRate) ** assumptions.forecastYears;
  const enterpriseValue = presentValueOfCashFlows + presentValueOfTerminalValue;
  const equityValue = enterpriseValue - assumptions.netDebt;
  const perShareValue = equityValue / assumptions.sharesOutstanding;

  return {
    enterpriseValue,
    equityValue,
    perShareValue,
    terminalValue,
    presentValueOfCashFlows,
    presentValueOfTerminalValue,
    assumptions: {
      ...assumptions,
      terminalGrowthRate,
    },
  };
}

function makeGrowthPath(startGrowth: number, terminalGrowth: number, forecastYears: number): number[] {
  return Array.from({ length: forecastYears }, (_, index) => {
    const progress = forecastYears === 1 ? 1 : index / (forecastYears - 1);
    const fadedGrowth = startGrowth + (terminalGrowth + 0.02 - startGrowth) * progress * 0.65;
    return clamp(fadedGrowth, -0.2, 0.35);
  });
}

function scenarioConfidence(name: ScenarioName, baseConfidence: number): number {
  if (name === "Base") return baseConfidence;
  return clamp(baseConfidence - 8, 10, 95);
}

function buildScenario(
  name: ScenarioName,
  assumptions: DiscountedCashFlowAssumptions,
  baseConfidence: number,
): DcfScenarioResult {
  const result = computeDiscountedCashFlow(assumptions);
  return {
    name,
    confidence: scenarioConfidence(name, baseConfidence),
    ...result,
    enterpriseValue: round(result.enterpriseValue, 2) ?? result.enterpriseValue,
    equityValue: round(result.equityValue, 2) ?? result.equityValue,
    perShareValue: round(result.perShareValue, 2) ?? result.perShareValue,
    terminalValue: round(result.terminalValue, 2) ?? result.terminalValue,
    presentValueOfCashFlows: round(result.presentValueOfCashFlows, 2) ?? result.presentValueOfCashFlows,
    presentValueOfTerminalValue:
      round(result.presentValueOfTerminalValue, 2) ?? result.presentValueOfTerminalValue,
  };
}

export function computeDcfRange(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics = computeFinancialMetrics(input),
): DcfRangeResult {
  const sector = input.company.sector ?? "other";
  const currency = metrics.latestPeriod?.currency ?? input.company.currency;
  const missingData: MissingDataItem[] = [];

  if (sector === "financials") {
    return {
      status: "inappropriate",
      method: "FCFF DCF",
      currency,
      reason:
        "A standard free-cash-flow-to-firm DCF is not appropriate for most financial companies because debt is operating capital.",
      low: null,
      mid: null,
      high: null,
      scenarios: [],
      missingData,
    };
  }

  const latest = metrics.latestPeriod;
  const baseFreeCashFlow = firstFinite(
    input.dcfAssumptions?.baseFreeCashFlow,
    deriveFreeCashFlow(latest),
  );
  const sharesOutstanding = firstFinite(
    input.dcfAssumptions?.sharesOutstanding,
    input.market?.sharesOutstanding,
    latest?.sharesDiluted,
  );
  const netDebt = firstFinite(input.dcfAssumptions?.netDebt, metrics.ratios.netDebt, 0);

  if (!isFiniteNumber(baseFreeCashFlow) || baseFreeCashFlow <= 0) {
    addMissingData(
      missingData,
      "baseFreeCashFlow",
      "Positive free cash flow is required for this DCF model.",
      "dcf",
      "high",
    );
  }

  if (!isFiniteNumber(sharesOutstanding) || sharesOutstanding <= 0) {
    addMissingData(
      missingData,
      "sharesOutstanding",
      "Shares outstanding are required to convert intrinsic equity value into a per-share range.",
      "dcf",
      "high",
    );
  }

  if (missingData.length > 0) {
    return {
      status: "unavailable",
      method: "FCFF DCF",
      currency,
      reason: "Required deterministic DCF inputs are missing or invalid.",
      low: null,
      mid: null,
      high: null,
      scenarios: [],
      missingData,
    };
  }

  if (!isFiniteNumber(baseFreeCashFlow) || !isFiniteNumber(sharesOutstanding)) {
    throw new Error("Validated DCF inputs unexpectedly became unavailable.");
  }

  const benchmarks = benchmarksForSector(sector);
  const forecastYears = clamp(
    Math.trunc(input.dcfAssumptions?.forecastYears ?? DEFAULT_FORECAST_YEARS),
    3,
    10,
  );
  const observedGrowth = firstFinite(
    input.estimates?.nextYearFreeCashFlowGrowth,
    metrics.growth.freeCashFlowCagr3y,
    metrics.growth.revenueCagr3y,
    metrics.growth.revenueGrowthYoY,
    0.02,
  ) as number;
  const beta = input.market?.beta ?? 1;
  const baseDiscountRate = clamp(
    input.dcfAssumptions?.discountRate ?? 0.09 + Math.max(0, beta - 1) * 0.015,
    0.075,
    0.15,
  );
  const baseTerminalGrowth = clamp(input.dcfAssumptions?.terminalGrowthRate ?? 0.025, 0, 0.04);
  const baseGrowth = clamp(observedGrowth, -0.08, benchmarks.maxDcfGrowth);
  const baseConfidence = clamp(
    72 +
      (metrics.growth.freeCashFlowCagr3y !== null ? 8 : 0) +
      (input.estimates?.nextYearFreeCashFlowGrowth !== null &&
      input.estimates?.nextYearFreeCashFlowGrowth !== undefined
        ? 5
        : 0) -
      (metrics.trends.operatingMarginChangeYoY !== null && metrics.trends.operatingMarginChangeYoY < -0.03 ? 8 : 0),
    35,
    92,
  );

  const overrideGrowthRates = input.dcfAssumptions?.fcfGrowthRates ?? null;
  const baseAssumptions: DiscountedCashFlowAssumptions = {
    baseFreeCashFlow,
    forecastYears,
    discountRate: baseDiscountRate,
    terminalGrowthRate: baseTerminalGrowth,
    fcfGrowthRates:
      overrideGrowthRates && overrideGrowthRates.length > 0
        ? overrideGrowthRates.slice(0, forecastYears)
        : makeGrowthPath(baseGrowth, baseTerminalGrowth, forecastYears),
    netDebt: netDebt ?? 0,
    sharesOutstanding,
  };
  const bearAssumptions: DiscountedCashFlowAssumptions = {
    ...baseAssumptions,
    discountRate: clamp(baseDiscountRate + 0.015, 0.08, 0.17),
    terminalGrowthRate: clamp(baseTerminalGrowth - 0.01, 0, 0.03),
    fcfGrowthRates: makeGrowthPath(clamp(baseGrowth - 0.06, -0.15, benchmarks.maxDcfGrowth), 0.015, forecastYears),
  };
  const bullAssumptions: DiscountedCashFlowAssumptions = {
    ...baseAssumptions,
    discountRate: clamp(baseDiscountRate - 0.01, 0.07, 0.14),
    terminalGrowthRate: clamp(baseTerminalGrowth + 0.005, 0.005, 0.04),
    fcfGrowthRates: makeGrowthPath(clamp(baseGrowth + 0.05, -0.02, benchmarks.maxDcfGrowth + 0.04), 0.03, forecastYears),
  };

  const scenarios = [
    buildScenario("Bear", bearAssumptions, baseConfidence),
    buildScenario("Base", baseAssumptions, baseConfidence),
    buildScenario("Bull", bullAssumptions, baseConfidence),
  ];
  const perShareValues = scenarios.map((scenario) => scenario.perShareValue).sort((a, b) => a - b);

  return {
    status: "available",
    method: "FCFF DCF",
    currency,
    low: perShareValues[0],
    mid: scenarios.find((scenario) => scenario.name === "Base")?.perShareValue ?? perShareValues[1],
    high: perShareValues.at(-1) ?? null,
    scenarios,
    missingData,
  };
}
