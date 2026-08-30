import { supportsFcffDcf, resolveFinancialArchetype } from "./archetypes";
import { benchmarksForSector, DCF_ASSUMPTION_POLICY_VERSION } from "./config";
import type {
  DcfRangeResult,
  DcfScenarioResult,
  DiscountedCashFlowAssumptions,
  DiscountedCashFlowResult,
  FinancialAnalysisInput,
  FinancialMetrics,
  MissingDataItem,
  ScenarioName,
  ValuationAssumption,
  ValuationAssumptionQuality,
} from "./types";
import { addMissingData, clamp, firstFinite, isFiniteNumber, round } from "./math";
import { economicCurrencyCode, quotePriceToEconomic } from "./currency-units";
import {
  computeFinancialMetrics,
  contiguousAnnualHistory,
  currentSharesForDcf,
  deriveFcff,
  hasStaleMarketPriceForValuation,
  marketCapShareBasisDifference,
  valuationCurrencyAlignment,
} from "./metrics";

const DEFAULT_FORECAST_YEARS = 5;
const MAX_TTM_BALANCE_LAG_DAYS = 45;

function hasTtmCapitalStructureAlignmentGap(input: FinancialAnalysisInput): boolean {
  const ttmFlowEnd = input.trailingTwelveMonths?.periodEndDate;
  const ttmBalanceEnd = input.trailingTwelveMonths?.balanceSheetDate;
  if (!ttmFlowEnd || !ttmBalanceEnd) return false;
  const balanceLagDays = (Date.parse(ttmFlowEnd) - Date.parse(ttmBalanceEnd)) / 86_400_000;
  return !Number.isFinite(balanceLagDays) || balanceLagDays < 0 || balanceLagDays > MAX_TTM_BALANCE_LAG_DAYS;
}

function withoutTtmPeriods(input: FinancialAnalysisInput): FinancialAnalysisInput {
  return {
    ...input,
    trailingTwelveMonths: undefined,
    priorTrailingTwelveMonths: undefined,
  };
}

function assumption(
  value: number | number[],
  source: string,
  asOf: string | null,
  valueKind: ValuationAssumption["valueKind"],
): ValuationAssumption {
  return { value, source, asOf, valueKind, version: DCF_ASSUMPTION_POLICY_VERSION };
}

function assumptionQuality(
  assumptions: Record<string, ValuationAssumption>,
): ValuationAssumptionQuality {
  const fallbackCount = Object.values(assumptions).filter((item) => item.valueKind === "fallback").length;
  const central = new Set([
    "riskFreeRate", "equityRiskPremium", "beta", "preTaxCostOfDebt",
    "normalizedTaxRate", "nearTermGrowth", "terminalGrowthRate",
  ]);
  const centralFallbackCount = Object.entries(assumptions)
    .filter(([key, item]) => central.has(key) && item.valueKind === "fallback")
    .length;
  return {
    level: centralFallbackCount >= 3 ? "fallback_heavy" : fallbackCount > 0 ? "moderate" : "high",
    fallbackCount,
    centralFallbackCount,
    assumptions,
  };
}

export function computeDiscountedCashFlow(assumptions: DiscountedCashFlowAssumptions): DiscountedCashFlowResult {
  const scalarValues = [
    assumptions.baseFreeCashFlow,
    assumptions.forecastYears,
    assumptions.discountRate,
    assumptions.terminalGrowthRate,
    assumptions.netDebt,
    assumptions.sharesOutstanding,
  ];
  if (
    scalarValues.some((value) => !Number.isFinite(value))
    || assumptions.fcfGrowthRates.some((value) => !Number.isFinite(value))
    || assumptions.fcfGrowthRates.length !== assumptions.forecastYears
    || !Number.isInteger(assumptions.forecastYears)
    || assumptions.forecastYears < 1
    || assumptions.sharesOutstanding <= 0
    || assumptions.discountRate <= assumptions.terminalGrowthRate
    || assumptions.discountRate <= 0
  ) {
    throw new RangeError("Invalid DCF assumptions.");
  }
  const cashFlows: number[] = [];
  let cashFlow = assumptions.baseFreeCashFlow;
  for (let year = 0; year < assumptions.forecastYears; year += 1) {
    const growth = assumptions.fcfGrowthRates[year];
    if (!Number.isFinite(growth)) throw new RangeError("Invalid DCF assumptions.");
    cashFlow *= 1 + growth;
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

function routedMethod(archetype: ReturnType<typeof resolveFinancialArchetype>): { method: string; reason: string } {
  switch (archetype) {
    case "bank":
    case "insurer":
      return { method: "Residual income / equity multiples", reason: "Specialized equity and regulatory-capital inputs are required; corporate FCFF is inappropriate." };
    case "reit":
      return { method: "AFFO / NAV", reason: "Provider-reported AFFO and property NAV inputs are required; corporate FCFF is inappropriate." };
    case "property_company":
      return { method: "NAV / property earnings", reason: "Property-company valuation requires property-level NAV, NOI or cap-rate inputs; corporate FCFF is inappropriate." };
    case "asset_manager":
      return { method: "AUM / fee-related earnings", reason: "Asset-manager valuation requires AUM, net flows or fee-related earnings inputs; corporate FCFF is inappropriate." };
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
  const assumptions: Record<string, ValuationAssumption> = {};
  const marketCap = metrics.valuation.marketCap;
  const debt = metrics.latestPeriod?.totalDebt;
  if (!isFiniteNumber(marketCap) || marketCap <= 0 || !isFiniteNumber(debt) || debt < 0) return null;
  const analysisAsOf = input.analysisDate ?? null;
  const configuredRiskFree = input.dcfAssumptions?.riskFreeRate;
  const riskFree = isFiniteNumber(configuredRiskFree) ? configuredRiskFree : 0.04;
  assumptions.riskFreeRate = assumption(
    riskFree,
    isFiniteNumber(configuredRiskFree) ? "Analysis configuration" : "StockBox versioned policy",
    analysisAsOf,
    isFiniteNumber(configuredRiskFree) ? "configured" : "policy",
  );
  const configuredErp = input.dcfAssumptions?.equityRiskPremium;
  const erp = isFiniteNumber(configuredErp) ? configuredErp : 0.05;
  assumptions.equityRiskPremium = assumption(
    erp,
    isFiniteNumber(configuredErp) ? "Analysis configuration" : "StockBox versioned policy",
    analysisAsOf,
    isFiniteNumber(configuredErp) ? "configured" : "policy",
  );
  const configuredCountryRisk = input.dcfAssumptions?.countryRiskPremium;
  const countryRisk = isFiniteNumber(configuredCountryRisk) ? configuredCountryRisk : 0;
  assumptions.countryRiskPremium = assumption(
    countryRisk,
    isFiniteNumber(configuredCountryRisk) ? "Analysis configuration" : "StockBox versioned policy",
    analysisAsOf,
    isFiniteNumber(configuredCountryRisk) ? "configured" : "policy",
  );
  const beta = isFiniteNumber(input.market?.beta) ? input.market.beta : 1;
  assumptions.beta = assumption(
    beta,
    isFiniteNumber(input.market?.beta) ? input.market?.provider ?? "Market data provider" : "StockBox configured fallback",
    input.market?.priceDate ?? analysisAsOf,
    isFiniteNumber(input.market?.beta) ? "market_sourced" : "fallback",
  );
  if (!isFiniteNumber(configuredRiskFree)) notes.push("StockBox policy risk-free rate: 4.0%.");
  if (!isFiniteNumber(configuredErp)) notes.push("StockBox policy equity risk premium: 5.0%.");
  if (!isFiniteNumber(configuredCountryRisk)) notes.push("StockBox policy country risk premium: 0.0%.");
  if (!isFiniteNumber(input.market?.beta)) notes.push("Fallback beta: 1.0.");
  const interest = metrics.latestPeriod?.interestExpense;
  const observedDebtCost = isFiniteNumber(interest) && debt > 0 ? Math.abs(interest) / debt : null;
  const configuredDebtCost = input.dcfAssumptions?.preTaxCostOfDebt;
  const debtCost = firstFinite(configuredDebtCost, observedDebtCost, 0.05) as number;
  assumptions.preTaxCostOfDebt = assumption(
    debtCost,
    isFiniteNumber(configuredDebtCost)
      ? "Analysis configuration"
      : isFiniteNumber(observedDebtCost)
        ? "Derived from reported interest expense and debt"
        : "StockBox configured fallback",
    isFiniteNumber(observedDebtCost) ? metrics.latestPeriod?.periodEndDate ?? null : analysisAsOf,
    isFiniteNumber(configuredDebtCost) ? "configured" : isFiniteNumber(observedDebtCost) ? "derived" : "fallback",
  );
  if (!isFiniteNumber(configuredDebtCost) && !isFiniteNumber(observedDebtCost) && debt > 0) notes.push("Fallback pre-tax cost of debt: 5.0%.");
  const taxRate = metrics.cashFlow.normalizedTaxRate;
  if (!isFiniteNumber(taxRate)) return null;
  assumptions.normalizedTaxRate = assumption(
    taxRate,
    metrics.cashFlow.taxRateSource === "fallback_assumption"
      ? "StockBox configured fallback"
      : "Normalized from reported tax and pretax income",
    metrics.latestPeriod?.periodEndDate ?? null,
    metrics.cashFlow.taxRateSource === "fallback_assumption" ? "fallback" : "derived",
  );
  if (metrics.cashFlow.taxRateSource === "fallback_assumption") notes.push("Fallback normalized tax rate: 21.0%.");
  const totalCapital = marketCap + debt;
  const equityWeight = marketCap / totalCapital;
  const debtWeight = debt / totalCapital;
  const costOfEquity = riskFree + beta * erp + countryRisk;
  const wacc = equityWeight * costOfEquity + debtWeight * debtCost * (1 - taxRate);
  const boundedWacc = clamp(wacc, 0.06, 0.18);
  assumptions.derivedWacc = assumption(
    boundedWacc,
    "StockBox market-value WACC formula",
    analysisAsOf,
    "derived",
  );
  return { wacc: boundedWacc, notes, assumptions };
}

function normalizedCyclicalFcff(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics,
): { value: number; periods: number } | null {
  const history = contiguousAnnualHistory(input.annualPeriods, 7);
  if (history.length < 4 || !isFiniteNumber(metrics.cashFlow.normalizedTaxRate)) return null;
  const currencies = new Set(history.map((period) => period.currency).filter(Boolean));
  if (currencies.size > 1) return null;
  const margins = history.flatMap((period) => {
    const fcff = deriveFcff(period, metrics.cashFlow.normalizedTaxRate as number);
    return isFiniteNumber(fcff) && isFiniteNumber(period.revenue) && period.revenue > 0
      ? [fcff / period.revenue]
      : [];
  });
  const latestRevenue = history.at(-1)?.revenue;
  if (margins.length < 4 || !isFiniteNumber(latestRevenue) || latestRevenue <= 0) return null;
  const orderedMargins = [...margins].sort((left, right) => left - right);
  const middle = Math.floor(orderedMargins.length / 2);
  const medianMargin = orderedMargins.length % 2
    ? orderedMargins[middle]
    : (orderedMargins[middle - 1] + orderedMargins[middle]) / 2;
  const value = medianMargin * latestRevenue;
  return isFiniteNumber(value) && value > 0 ? { value, periods: margins.length } : null;
}

export function computeDcfRange(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics = computeFinancialMetrics(input),
): DcfRangeResult {
  const archetype = resolveFinancialArchetype(input);
  const useAnnualDcfFallback = hasTtmCapitalStructureAlignmentGap(input);
  const dcfInput = useAnnualDcfFallback ? withoutTtmPeriods(input) : input;
  const dcfMetrics = useAnnualDcfFallback ? computeFinancialMetrics(dcfInput) : metrics;
  const marketQuoteCurrency = input.market?.currency ?? input.company.tradingCurrency;
  const currency = economicCurrencyCode(marketQuoteCurrency)
    ?? economicCurrencyCode(dcfMetrics.latestPeriod?.currency ?? input.company.reportingCurrency ?? input.company.currency)
    ?? undefined;
  if (!supportsFcffDcf(archetype)) {
    const route = routedMethod(archetype);
    return unavailable(archetype === "unknown" ? "unavailable" : "inappropriate", route.method, route.reason, currency);
  }

  const missingData: MissingDataItem[] = [];
  const currencyAlignment = valuationCurrencyAlignment(dcfInput, dcfMetrics.latestPeriod);
  if (currencyAlignment !== "aligned") {
    const reason = currencyAlignment === "mismatch"
      ? "Financial and market currencies differ; FX conversion is required before per-share FCFF DCF."
      : "Reporting or trading currency is unknown; per-share FCFF DCF requires explicit aligned currencies.";
    addMissingData(
      missingData,
      "currencyAlignment",
      reason,
      "dcf",
      "high",
    );
    return unavailable(
      "unavailable",
      "FCFF DCF",
      currencyAlignment === "mismatch"
        ? "Financial and market currencies differ; DCF is unavailable until currency conversion is explicit."
        : "Currency alignment is unknown; DCF is unavailable until reporting and trading currencies are verified.",
      currency,
      missingData,
    );
  }
  if (hasStaleMarketPriceForValuation(dcfInput)) {
    addMissingData(
      missingData,
      "marketPriceFreshness",
      "Market price data is stale or future-dated; DCF requires a current market price or market cap.",
      "dcf",
      "high",
    );
    return unavailable(
      "unavailable",
      "FCFF DCF",
      "Market price data is stale or future-dated; DCF is unavailable until market data freshness is restored.",
      currency,
      missingData,
    );
  }
  const shareBasisDifference = marketCapShareBasisDifference(dcfInput, dcfMetrics.latestPeriod);
  if (isFiniteNumber(shareBasisDifference) && shareBasisDifference > 0.05) {
    addMissingData(
      missingData,
      "shareBasisAlignment",
      "Market cap and quote price times current shares differ by more than 5%; per-share valuation requires a verified listing-specific share basis.",
      "dcf",
      "high",
    );
    return unavailable(
      "unavailable",
      "FCFF DCF",
      "Market cap and current share basis do not reconcile; per-share DCF is unavailable until the listing-specific share basis is verified.",
      currency,
      missingData,
    );
  }
  const configuredForecastYears = dcfInput.dcfAssumptions?.forecastYears;
  if (configuredForecastYears != null && (
    !Number.isInteger(configuredForecastYears)
    || configuredForecastYears < 3
    || configuredForecastYears > 10
  )) {
    addMissingData(
      missingData,
      "forecastYears",
      "Custom forecast horizon must be an integer between 3 and 10 years.",
      "dcf",
      "high",
    );
    return unavailable("unavailable", archetype === "cyclical" ? "Normalized FCFF DCF" : "FCFF DCF", "Custom forecast horizon is invalid.", currency, missingData);
  }
  const forecastYears = configuredForecastYears ?? DEFAULT_FORECAST_YEARS;
  const customGrowthRates = dcfInput.dcfAssumptions?.fcfGrowthRates;
  if (customGrowthRates && (
    customGrowthRates.length === 0
    || customGrowthRates.length !== forecastYears
    || customGrowthRates.some((growth) => !isFiniteNumber(growth))
  )) {
    addMissingData(
      missingData,
      "fcfGrowthRates",
      "Custom FCF growth assumptions must include exactly one finite value for each forecast year.",
      "dcf",
      "high",
    );
    return unavailable("unavailable", archetype === "cyclical" ? "Normalized FCFF DCF" : "FCFF DCF", "Custom FCF growth assumptions are invalid.", currency, missingData);
  }
  const normalizedCycle = archetype === "cyclical" ? normalizedCyclicalFcff(dcfInput, dcfMetrics) : null;
  if (archetype === "cyclical" && !normalizedCycle) {
    addMissingData(
      missingData,
      "normalizedCycleHistory",
      "At least four contiguous comparable annual periods with revenue and FCFF inputs are required for cyclical normalization.",
      "dcf",
      "high",
    );
  }
  const baseFcff = archetype === "cyclical"
    ? normalizedCycle?.value ?? null
    : firstFinite(dcfInput.dcfAssumptions?.baseFreeCashFlow, dcfMetrics.cashFlow.fcff);
  const shares = firstFinite(dcfInput.dcfAssumptions?.sharesOutstanding, currentSharesForDcf(dcfInput, dcfMetrics.latestPeriod));
  const netDebt = firstFinite(dcfInput.dcfAssumptions?.netDebt, dcfMetrics.ratios.netDebt);
  const configuredDiscountRate = dcfInput.dcfAssumptions?.discountRate;
  const hasConfiguredDiscountRate = isFiniteNumber(configuredDiscountRate);
  const wacc = hasConfiguredDiscountRate ? null : deriveWacc(dcfInput, dcfMetrics);
  if (!isFiniteNumber(baseFcff) || baseFcff <= 0) addMissingData(missingData, "baseFcff", "Positive FCFF is required for an FCFF DCF.", "dcf", "high");
  if (!isFiniteNumber(shares) || shares <= 0) addMissingData(missingData, "sharesOutstanding", "Current shares are required for per-share value.", "dcf", "high");
  if (!isFiniteNumber(netDebt)) addMissingData(missingData, "netDebt", "Reported debt and cash are required; missing debt is not zero.", "dcf", "high");
  if (!hasConfiguredDiscountRate && !wacc) addMissingData(missingData, "wacc", "Market-value capital weights and reported debt are required when no explicit discount rate is configured.", "dcf", "high");
  if (dcfInput.dcfAssumptions?.discountRate !== undefined && !isFiniteNumber(dcfInput.dcfAssumptions.discountRate)) {
    addMissingData(missingData, "discountRate", "Custom discount rate must be finite.", "dcf", "high");
  }
  if (dcfInput.dcfAssumptions?.terminalGrowthRate !== undefined && !isFiniteNumber(dcfInput.dcfAssumptions.terminalGrowthRate)) {
    addMissingData(missingData, "terminalGrowthRate", "Custom terminal growth rate must be finite.", "dcf", "high");
  }
  if (
    isFiniteNumber(dcfInput.dcfAssumptions?.discountRate)
    && isFiniteNumber(dcfInput.dcfAssumptions?.terminalGrowthRate)
    && dcfInput.dcfAssumptions.discountRate <= dcfInput.dcfAssumptions.terminalGrowthRate
  ) {
    addMissingData(missingData, "discountRate", "Custom discount rate must exceed terminal growth.", "dcf", "high");
  }
  if (missingData.length || !isFiniteNumber(baseFcff) || !isFiniteNumber(shares) || !isFiniteNumber(netDebt) || (!hasConfiguredDiscountRate && !wacc)) {
    return unavailable("unavailable", archetype === "cyclical" ? "Normalized FCFF DCF" : "FCFF DCF", "Required deterministic FCFF, capital structure, WACC or per-share inputs are missing.", currency, missingData);
  }

  const observedGrowth = firstFinite(
    dcfInput.estimates?.nextYearFreeCashFlowGrowth,
    dcfMetrics.growth.freeCashFlowCagr3y,
    dcfMetrics.growth.revenueCagr3y,
    dcfMetrics.growth.revenueGrowthYoY,
  );
  const assumptionNotes = [...(wacc?.notes ?? [])];
  if (useAnnualDcfFallback) {
    assumptionNotes.push("Annual fallback: DCF excludes stale TTM capital-structure data and uses latest annual or explicitly configured FCFF and net-debt inputs.");
  }
  if (!wacc && !isFiniteNumber(dcfInput.dcfAssumptions?.baseFreeCashFlow) && dcfMetrics.cashFlow.taxRateSource === "fallback_assumption") {
    assumptionNotes.push("Fallback normalized tax rate: 21.0%.");
  }
  if (normalizedCycle) {
    assumptionNotes.push(`Base FCFF uses the median FCFF margin across ${normalizedCycle.periods} contiguous annual periods, scaled to latest annual revenue.`);
  }
  const startGrowth = isFiniteNumber(observedGrowth) ? observedGrowth : 0.02;
  if (!isFiniteNumber(observedGrowth)) assumptionNotes.push("Fallback near-term growth: 2.0% because normalized or forward growth is unavailable.");
  const maxGrowth = benchmarksForSector(dcfInput.company.sector).maxDcfGrowth;
  const effectiveDiscountRate = hasConfiguredDiscountRate ? configuredDiscountRate : wacc?.wacc;
  if (!isFiniteNumber(effectiveDiscountRate)) {
    return unavailable("unavailable", archetype === "cyclical" ? "Normalized FCFF DCF" : "FCFF DCF", "A valid discount rate could not be established.", currency, missingData);
  }
  const terminalGrowth = clamp(dcfInput.dcfAssumptions?.terminalGrowthRate ?? 0.025, 0, Math.min(0.03, effectiveDiscountRate - 0.015));
  if (!isFiniteNumber(dcfInput.dcfAssumptions?.terminalGrowthRate)) assumptionNotes.push("StockBox policy terminal growth: 2.5%, capped below WACC and 3.0%.");
  const baseGrowth = clamp(startGrowth, -0.1, maxGrowth);
  const boundedGrowthRates = customGrowthRates?.slice(0, forecastYears).map((growth) => clamp(growth, -0.2, maxGrowth));
  const discountRate = clamp(effectiveDiscountRate, 0.06, 0.18);
  const base: DiscountedCashFlowAssumptions = {
    baseFreeCashFlow: baseFcff,
    forecastYears,
    discountRate,
    terminalGrowthRate: terminalGrowth,
    fcfGrowthRates: boundedGrowthRates ?? growthFade(baseGrowth, terminalGrowth, forecastYears),
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
  const fcffTaxAssumptions: Record<string, ValuationAssumption> =
    !wacc && !isFiniteNumber(dcfInput.dcfAssumptions?.baseFreeCashFlow) && isFiniteNumber(dcfMetrics.cashFlow.normalizedTaxRate)
      ? {
          normalizedTaxRate: assumption(
            dcfMetrics.cashFlow.normalizedTaxRate,
            dcfMetrics.cashFlow.taxRateSource === "fallback_assumption"
              ? "StockBox configured fallback"
              : "Normalized from reported tax and pretax income",
            dcfMetrics.latestPeriod?.periodEndDate ?? input.analysisDate ?? null,
            dcfMetrics.cashFlow.taxRateSource === "fallback_assumption" ? "fallback" : "derived",
          ),
        }
      : {};
  const valuationAssumptions: Record<string, ValuationAssumption> = {
    ...(wacc?.assumptions ?? {}),
    ...fcffTaxAssumptions,
    baseFreeCashFlow: assumption(
      baseFcff,
      normalizedCycle
        ? "StockBox median full-cycle FCFF margin"
        : isFiniteNumber(dcfInput.dcfAssumptions?.baseFreeCashFlow)
          ? "Analysis configuration"
          : "Derived from reported cash flow, interest and capital expenditures",
      normalizedCycle ? dcfInput.annualPeriods.at(-1)?.periodEndDate ?? null : dcfMetrics.latestPeriod?.periodEndDate ?? null,
      normalizedCycle || !isFiniteNumber(dcfInput.dcfAssumptions?.baseFreeCashFlow) ? "derived" : "configured",
    ),
    sharesOutstanding: assumption(
      shares,
      isFiniteNumber(dcfInput.dcfAssumptions?.sharesOutstanding)
        ? "Analysis configuration"
        : isFiniteNumber(dcfInput.market?.sharesOutstanding)
          ? dcfInput.market?.provider ?? "Market data provider"
          : "Reported current shares outstanding",
      dcfInput.market?.sharesOutstandingAsOf ?? dcfMetrics.latestPeriod?.periodEndDate ?? null,
      isFiniteNumber(dcfInput.dcfAssumptions?.sharesOutstanding)
        ? "configured"
        : isFiniteNumber(dcfInput.market?.sharesOutstanding)
          ? "market_sourced"
          : "reported",
    ),
    netDebt: assumption(
      netDebt,
      isFiniteNumber(dcfInput.dcfAssumptions?.netDebt) ? "Analysis configuration" : "Derived from reported debt and cash",
      dcfMetrics.latestPeriod?.periodEndDate ?? null,
      isFiniteNumber(dcfInput.dcfAssumptions?.netDebt) ? "configured" : "derived",
    ),
    forecastYears: assumption(
      forecastYears,
      isFiniteNumber(dcfInput.dcfAssumptions?.forecastYears) ? "Analysis configuration" : "StockBox versioned forecast policy",
      input.analysisDate ?? null,
      isFiniteNumber(dcfInput.dcfAssumptions?.forecastYears) ? "configured" : "policy",
    ),
    discountRate: assumption(
      discountRate,
      isFiniteNumber(dcfInput.dcfAssumptions?.discountRate) ? "Analysis configuration" : "Derived WACC",
      input.analysisDate ?? null,
      isFiniteNumber(dcfInput.dcfAssumptions?.discountRate) ? "configured" : "derived",
    ),
    terminalGrowthRate: assumption(
      terminalGrowth,
      isFiniteNumber(dcfInput.dcfAssumptions?.terminalGrowthRate) ? "Analysis configuration" : "StockBox versioned terminal-growth policy",
      input.analysisDate ?? null,
      isFiniteNumber(dcfInput.dcfAssumptions?.terminalGrowthRate) ? "configured" : "policy",
    ),
    nearTermGrowth: assumption(
      baseGrowth,
      boundedGrowthRates
        ? "Analysis configuration"
        : isFiniteNumber(dcfInput.estimates?.nextYearFreeCashFlowGrowth)
          ? "Forward estimates provider"
          : isFiniteNumber(observedGrowth)
            ? "Derived from reported historical growth"
            : "StockBox configured fallback",
      input.analysisDate ?? null,
      boundedGrowthRates
        ? "configured"
        : isFiniteNumber(dcfInput.estimates?.nextYearFreeCashFlowGrowth)
          ? "market_sourced"
          : isFiniteNumber(observedGrowth)
            ? "derived"
            : "fallback",
    ),
    fcfGrowthRates: assumption(
      base.fcfGrowthRates,
      boundedGrowthRates ? "Analysis configuration" : "StockBox growth fade formula",
      input.analysisDate ?? null,
      boundedGrowthRates ? "configured" : "derived",
    ),
  };
  const quality = assumptionQuality(valuationAssumptions);
  const currencyRequiresExplicitCountryRisk = !hasConfiguredDiscountRate
    && currency !== undefined
    && currency.toUpperCase() !== "USD"
    && !isFiniteNumber(dcfInput.dcfAssumptions?.countryRiskPremium);
  let confidence = clamp(
    90 - quality.fallbackCount * 6 - (dcfInput.trailingTwelveMonths || normalizedCycle ? 0 : 10),
    20,
    92,
  );
  let scenarios = [buildScenario("Bear", bear, confidence), buildScenario("Base", base, confidence), buildScenario("Bull", bull, confidence)];
  let baseResult = scenarios[1];
  const terminalValueShare = baseResult.presentValueOfTerminalValue / baseResult.enterpriseValue;
  const sensitivity = [-0.01, 0, 0.01].flatMap((rateDelta) => [-0.005, 0, 0.005].map((growthDelta) => {
    const result = computeDiscountedCashFlow({
      ...base,
      discountRate: clamp(base.discountRate + rateDelta, 0.055, 0.2),
      terminalGrowthRate: clamp(base.terminalGrowthRate + growthDelta, 0, base.discountRate + rateDelta - 0.015),
    });
    return { discountRate: base.discountRate + rateDelta, terminalGrowthRate: base.terminalGrowthRate + growthDelta, perShareValue: result.perShareValue };
  }));
  if (terminalValueShare > 0.75) {
    assumptionNotes.push("Terminal value exceeds 75% of enterprise value; valuation sensitivity is elevated.");
    confidence = clamp(confidence - 15, 10, 92);
    scenarios = scenarios.map((scenario) => ({
      ...scenario,
      confidence: scenario.name === "Base" ? confidence : Math.max(10, confidence - 8),
    }));
    baseResult = scenarios[1];
  }
  const values = scenarios.map((item) => item.perShareValue).sort((a, b) => a - b);
  const currentPrice = quotePriceToEconomic(input.market?.price, marketQuoteCurrency);
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
    assumptionQuality: quality,
    directionalSupport: quality.level !== "fallback_heavy" && confidence >= 45 && !currencyRequiresExplicitCountryRisk,
  };
}
