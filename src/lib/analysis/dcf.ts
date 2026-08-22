import { supportsFcffDcf, resolveArchetype } from "./archetypes";
import { benchmarksForSector } from "./config";
import type {
  DcfRangeResult,
  DcfScenarioResult,
  DiscountedCashFlowAssumptions,
  DiscountedCashFlowResult,
  FinancialAnalysisInput,
  FinancialMetrics,
  MissingDataItem,
  ScenarioName,
} from "./types";
import { addMissingData, clamp, firstFinite, isFiniteNumber, round } from "./math";
import { computeFinancialMetrics } from "./metrics";

const DEFAULT_FORECAST_YEARS = 5;

export function computeDiscountedCashFlow(assumptions: DiscountedCashFlowAssumptions): DiscountedCashFlowResult {
  const cashFlows: number[] = [];
  let cashFlow = assumptions.baseFreeCashFlow;
  for (let year = 0; year < assumptions.forecastYears; year += 1) {
    cashFlow *= 1 + (assumptions.fcfGrowthRates[year] ?? assumptions.fcfGrowthRates.at(-1) ?? 0);
    cashFlows.push(cashFlow);
  }
  const presentValueOfCashFlows = cashFlows.reduce(
    (sum, value, index) => sum + value / (1 + assumptions.discountRate) ** (index + 1),
    0,
  );
  const terminalGrowthRate = Math.min(assumptions.terminalGrowthRate, assumptions.discountRate - 0.015, 0.03);
  const finalCashFlow = cashFlows.at(-1) ?? assumptions.baseFreeCashFlow;
  const terminalValue = (finalCashFlow * (1 + terminalGrowthRate)) / (assumptions.discountRate - terminalGrowthRate);
  const presentValueOfTerminalValue = terminalValue / (1 + assumptions.discountRate) ** assumptions.forecastYears;
  const enterpriseValue = presentValueOfCashFlows + presentValueOfTerminalValue;
  const equityValue = enterpriseValue - assumptions.netDebt;
  return {
    enterpriseValue,
    equityValue,
    perShareValue: equityValue / assumptions.sharesOutstanding,
    terminalValue,
    presentValueOfCashFlows,
    presentValueOfTerminalValue,
    assumptions: { ...assumptions, terminalGrowthRate },
  };
}

function growthFade(start: number, terminal: number, years: number): number[] {
  return Array.from({ length: years }, (_, index) => {
    const progress = (index + 1) / years;
    return clamp(start + (terminal - start) * progress, -0.2, 0.35);
  });
}

function buildScenario(name: ScenarioName, assumptions: DiscountedCashFlowAssumptions, confidence: number): DcfScenarioResult {
  const result = computeDiscountedCashFlow(assumptions);
  return {
    name,
    confidence: name === "Base" ? confidence : Math.max(10, confidence - 8),
    ...result,
    enterpriseValue: round(result.enterpriseValue, 2) ?? result.enterpriseValue,
    equityValue: round(result.equityValue, 2) ?? result.equityValue,
    perShareValue: round(result.perShareValue, 2) ?? result.perShareValue,
    terminalValue: round(result.terminalValue, 2) ?? result.terminalValue,
    presentValueOfCashFlows: round(result.presentValueOfCashFlows, 2) ?? result.presentValueOfCashFlows,
    presentValueOfTerminalValue: round(result.presentValueOfTerminalValue, 2) ?? result.presentValueOfTerminalValue,
  };
}

function unavailable(
  status: "unavailable" | "inappropriate",
  method: string,
  reason: string,
  currency: string | undefined,
  missingData: MissingDataItem[] = [],
): DcfRangeResult {
  return { status, method, reason, currency, low: null, mid: null, high: null, scenarios: [], missingData, confidence: 0 };
}

function routedMethod(archetype: ReturnType<typeof resolveArchetype>): { method: string; reason: string } {
  switch (archetype) {
    case "bank":
    case "insurer":
      return { method: "Residual income / equity multiples", reason: "Specialized equity and regulatory-capital inputs are required; corporate FCFF is inappropriate." };
    case "reit":
      return { method: "AFFO / NAV", reason: "Provider-reported AFFO and property NAV inputs are required; corporate FCFF is inappropriate." };
    case "holding_company":
      return { method: "NAV / SOTP", reason: "Look-through holdings and holding-company net debt are required." };
    case "pre_revenue_biotech":
      return { method: "Risk-adjusted pipeline valuation", reason: "Asset-level pipeline probabilities and cash-flow forecasts are required." };
    default:
      return { method: "No suitable valuation", reason: "The company archetype is unknown or unsupported by current provider data." };
  }
}

function deriveWacc(input: FinancialAnalysisInput, metrics: FinancialMetrics) {
  const notes: string[] = [];
  const marketCap = metrics.valuation.marketCap;
  const debt = metrics.latestPeriod?.totalDebt;
  if (!isFiniteNumber(marketCap) || marketCap <= 0 || !isFiniteNumber(debt) || debt < 0) return null;
  const riskFree = firstFinite(input.dcfAssumptions?.riskFreeRate, 0.04) as number;
  const erp = firstFinite(input.dcfAssumptions?.equityRiskPremium, 0.05) as number;
  const countryRisk = firstFinite(input.dcfAssumptions?.countryRiskPremium, 0) as number;
  const beta = firstFinite(input.market?.beta, 1) as number;
  if (!isFiniteNumber(input.dcfAssumptions?.riskFreeRate)) notes.push("Fallback risk-free rate: 4.0%.");
  if (!isFiniteNumber(input.dcfAssumptions?.equityRiskPremium)) notes.push("Fallback equity risk premium: 5.0%.");
  if (!isFiniteNumber(input.market?.beta)) notes.push("Fallback beta: 1.0.");
  const interest = metrics.latestPeriod?.interestExpense;
  const observedDebtCost = isFiniteNumber(interest) && debt > 0 ? Math.abs(interest) / debt : null;
  const debtCost = firstFinite(input.dcfAssumptions?.preTaxCostOfDebt, observedDebtCost, 0.05) as number;
  if (!isFiniteNumber(input.dcfAssumptions?.preTaxCostOfDebt) && !isFiniteNumber(observedDebtCost) && debt > 0) notes.push("Fallback pre-tax cost of debt: 5.0%.");
  const taxRate = metrics.cashFlow.normalizedTaxRate;
  if (!isFiniteNumber(taxRate)) return null;
  if (metrics.cashFlow.taxRateSource === "fallback_assumption") notes.push("Fallback normalized tax rate: 21.0%.");
  const totalCapital = marketCap + debt;
  const equityWeight = marketCap / totalCapital;
  const debtWeight = debt / totalCapital;
  const costOfEquity = riskFree + beta * erp + countryRisk;
  const wacc = equityWeight * costOfEquity + debtWeight * debtCost * (1 - taxRate);
  return { wacc: clamp(wacc, 0.06, 0.18), notes };
}

export function computeDcfRange(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics = computeFinancialMetrics(input),
): DcfRangeResult {
  const archetype = resolveArchetype(input.company);
  const currency = input.market?.currency ?? metrics.latestPeriod?.currency ?? input.company.currency;
  if (!supportsFcffDcf(archetype)) {
    const route = routedMethod(archetype);
    return unavailable(archetype === "unknown" ? "unavailable" : "inappropriate", route.method, route.reason, currency);
  }

  const missingData: MissingDataItem[] = [];
  const baseFcff = firstFinite(input.dcfAssumptions?.baseFreeCashFlow, metrics.cashFlow.fcff);
  const shares = firstFinite(input.dcfAssumptions?.sharesOutstanding, input.market?.sharesOutstanding, metrics.latestPeriod?.currentSharesOutstanding, metrics.latestPeriod?.sharesDiluted);
  const netDebt = firstFinite(input.dcfAssumptions?.netDebt, metrics.ratios.netDebt);
  const wacc = deriveWacc(input, metrics);
  if (!isFiniteNumber(baseFcff) || baseFcff <= 0) addMissingData(missingData, "baseFcff", "Positive FCFF is required for an FCFF DCF.", "dcf", "high");
  if (!isFiniteNumber(shares) || shares <= 0) addMissingData(missingData, "sharesOutstanding", "Current shares are required for per-share value.", "dcf", "high");
  if (!isFiniteNumber(netDebt)) addMissingData(missingData, "netDebt", "Reported debt and cash are required; missing debt is not zero.", "dcf", "high");
  if (!wacc) addMissingData(missingData, "wacc", "Market-value capital weights and reported debt are required for WACC.", "dcf", "high");
  if (missingData.length || !isFiniteNumber(baseFcff) || !isFiniteNumber(shares) || !isFiniteNumber(netDebt) || !wacc) {
    return unavailable("unavailable", "FCFF DCF", "Required deterministic FCFF, capital structure, WACC or per-share inputs are missing.", currency, missingData);
  }

  const forecastYears = clamp(Math.trunc(input.dcfAssumptions?.forecastYears ?? DEFAULT_FORECAST_YEARS), 3, 10);
  const observedGrowth = firstFinite(
    input.estimates?.nextYearFreeCashFlowGrowth,
    metrics.growth.freeCashFlowCagr3y,
    metrics.growth.revenueCagr3y,
    metrics.growth.revenueGrowthYoY,
  );
  const assumptionNotes = [...wacc.notes];
  const startGrowth = isFiniteNumber(observedGrowth) ? observedGrowth : 0.02;
  if (!isFiniteNumber(observedGrowth)) assumptionNotes.push("Fallback near-term growth: 2.0% because normalized or forward growth is unavailable.");
  const maxGrowth = benchmarksForSector(input.company.sector).maxDcfGrowth;
  const terminalGrowth = clamp(input.dcfAssumptions?.terminalGrowthRate ?? 0.025, 0, Math.min(0.03, wacc.wacc - 0.015));
  if (!isFiniteNumber(input.dcfAssumptions?.terminalGrowthRate)) assumptionNotes.push("Fallback terminal growth: 2.5%, capped below WACC and 3.0%.");
  const baseGrowth = clamp(startGrowth, -0.1, maxGrowth);
  const base: DiscountedCashFlowAssumptions = {
    baseFreeCashFlow: baseFcff,
    forecastYears,
    discountRate: clamp(input.dcfAssumptions?.discountRate ?? wacc.wacc, 0.06, 0.18),
    terminalGrowthRate: terminalGrowth,
    fcfGrowthRates: input.dcfAssumptions?.fcfGrowthRates?.slice(0, forecastYears) ?? growthFade(baseGrowth, terminalGrowth, forecastYears),
    netDebt,
    sharesOutstanding: shares,
  };
  const bear: DiscountedCashFlowAssumptions = {
    ...base,
    discountRate: clamp(base.discountRate + 0.015, 0.07, 0.2),
    terminalGrowthRate: clamp(base.terminalGrowthRate - 0.01, 0, 0.025),
    fcfGrowthRates: growthFade(clamp(baseGrowth - 0.06, -0.2, maxGrowth), Math.max(0, terminalGrowth - 0.01), forecastYears),
  };
  const bull: DiscountedCashFlowAssumptions = {
    ...base,
    discountRate: clamp(base.discountRate - 0.01, 0.055, 0.17),
    terminalGrowthRate: clamp(base.terminalGrowthRate + 0.004, 0, Math.min(0.03, base.discountRate - 0.015)),
    fcfGrowthRates: growthFade(clamp(baseGrowth + 0.04, -0.05, maxGrowth), Math.min(0.03, terminalGrowth + 0.004), forecastYears),
  };
  const confidence = clamp(90 - assumptionNotes.length * 8 - (input.trailingTwelveMonths ? 0 : 10), 25, 92);
  const scenarios = [buildScenario("Bear", bear, confidence), buildScenario("Base", base, confidence), buildScenario("Bull", bull, confidence)];
  const values = scenarios.map((item) => item.perShareValue).sort((a, b) => a - b);
  const baseResult = scenarios[1];
  const terminalValueShare = baseResult.presentValueOfTerminalValue / baseResult.enterpriseValue;
  const sensitivity = [-0.01, 0, 0.01].flatMap((rateDelta) => [-0.005, 0, 0.005].map((growthDelta) => {
    const result = computeDiscountedCashFlow({
      ...base,
      discountRate: clamp(base.discountRate + rateDelta, 0.055, 0.2),
      terminalGrowthRate: clamp(base.terminalGrowthRate + growthDelta, 0, base.discountRate + rateDelta - 0.015),
    });
    return { discountRate: base.discountRate + rateDelta, terminalGrowthRate: base.terminalGrowthRate + growthDelta, perShareValue: result.perShareValue };
  }));
  if (terminalValueShare > 0.75) assumptionNotes.push("Terminal value exceeds 75% of enterprise value; valuation sensitivity is elevated.");
  const currentPrice = input.market?.price ?? null;
  return {
    status: "available",
    method: archetype === "cyclical" ? "Normalized FCFF DCF" : "FCFF DCF",
    currency,
    low: values[0],
    mid: baseResult.perShareValue,
    high: values.at(-1) ?? null,
    scenarios,
    missingData,
    currentPrice,
    impliedUpside: isFiniteNumber(currentPrice) && currentPrice > 0 ? baseResult.perShareValue / currentPrice - 1 : null,
    terminalValueShare,
    sensitivity,
    assumptionNotes,
    confidence,
  };
}
