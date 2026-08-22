import type {
  FinancialAnalysisInput,
  FinancialMetrics,
  FinancialPeriod,
  MetricProvenance,
  MissingDataItem,
  ValuationMetrics,
} from "./types";
import {
  addMissingData,
  calculateCagr,
  calculateGrowth,
  clamp,
  firstFinite,
  isFiniteNumber,
  safeDivide,
} from "./math";

const FALLBACK_TAX_RATE = 0.21;

function periodSortValue(period: FinancialPeriod): number {
  const date = period.periodEndDate ? Date.parse(period.periodEndDate) : Number.NaN;
  return Number.isFinite(date) ? date : period.fiscalYear ?? 0;
}

export function sortFinancialPeriods(periods: FinancialPeriod[]): FinancialPeriod[] {
  return [...periods].sort((a, b) => periodSortValue(a) - periodSortValue(b));
}

export function deriveSimpleFreeCashFlow(period: FinancialPeriod | null | undefined): number | null {
  if (!period) return null;
  if (isFiniteNumber(period.operatingCashFlow) && isFiniteNumber(period.capitalExpenditures)) {
    return period.operatingCashFlow - Math.abs(period.capitalExpenditures);
  }
  return isFiniteNumber(period.freeCashFlow) ? period.freeCashFlow : null;
}

/** @deprecated Use deriveSimpleFreeCashFlow and name the cash-flow concept explicitly. */
export const deriveFreeCashFlow = deriveSimpleFreeCashFlow;

function average(a: number | null | undefined, b: number | null | undefined): number | null {
  return isFiniteNumber(a) && isFiniteNumber(b) ? (a + b) / 2 : null;
}

function comparableBalancePeriods(current: FinancialPeriod | null, prior: FinancialPeriod | null): boolean {
  const currentEnd = current?.balanceSheetDate ?? current?.periodEndDate;
  const priorEnd = prior?.balanceSheetDate ?? prior?.periodEndDate;
  if (!currentEnd || !priorEnd) return false;
  const gap = (Date.parse(currentEnd) - Date.parse(priorEnd)) / 86_400_000;
  return Number.isFinite(gap) && gap >= 330 && gap <= 400;
}

function comparableTtmPeriods(current: FinancialPeriod | null, prior: FinancialPeriod | null): boolean {
  if (!current?.periodEndDate || !prior?.periodEndDate || !current.periodBasis || current.periodBasis !== prior.periodBasis) return false;
  if (!isFiniteNumber(current.currentYtdDurationDays) || !isFiniteNumber(prior.currentYtdDurationDays)) return false;
  const endGap = (Date.parse(current.periodEndDate) - Date.parse(prior.periodEndDate)) / 86_400_000;
  return Number.isFinite(endGap)
    && endGap >= 330
    && endGap <= 400
    && Math.abs(current.currentYtdDurationDays - prior.currentYtdDurationDays) <= 15;
}

function investedCapital(period: FinancialPeriod | null): number | null {
  if (!period || !isFiniteNumber(period.totalDebt) || !isFiniteNumber(period.totalEquity) || !isFiniteNumber(period.cashAndEquivalents)) {
    return null;
  }
  const value = period.totalDebt + period.totalEquity - period.cashAndEquivalents;
  return value > 0 ? value : null;
}

export function normalizedTaxRate(periods: FinancialPeriod[]): {
  rate: number;
  source: "reported_normalized" | "fallback_assumption";
} {
  const rates = periods
    .slice(-5)
    .map((period) => safeDivide(period.incomeTaxExpense, period.pretaxIncome))
    .filter((rate): rate is number => rate !== null && rate >= -0.1 && rate <= 0.6);
  if (rates.length > 0) {
    const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    return { rate: clamp(mean, 0.05, 0.4), source: "reported_normalized" };
  }
  return { rate: FALLBACK_TAX_RATE, source: "fallback_assumption" };
}

function deriveFcff(period: FinancialPeriod | null, taxRate: number): number | null {
  if (!period || !isFiniteNumber(period.operatingCashFlow) || !isFiniteNumber(period.capitalExpenditures) || !isFiniteNumber(period.interestExpense)) {
    return null;
  }
  return period.operatingCashFlow + Math.abs(period.interestExpense) * (1 - taxRate) - Math.abs(period.capitalExpenditures);
}

function deriveFcfe(period: FinancialPeriod | null): number | null {
  const simpleFcf = deriveSimpleFreeCashFlow(period);
  if (!isFiniteNumber(simpleFcf) || !isFiniteNumber(period?.netBorrowing)) return null;
  return simpleFcf + period.netBorrowing;
}

function stability(values: Array<number | null>): number | null {
  const available = values.filter(isFiniteNumber);
  if (available.length < 3) return null;
  const mean = available.reduce((sum, value) => sum + value, 0) / available.length;
  const scale = Math.max(Math.abs(mean), 0.01);
  const variance = available.reduce((sum, value) => sum + (value - mean) ** 2, 0) / available.length;
  return clamp(1 - Math.sqrt(variance) / scale, 0, 1);
}

function deriveMarketCap(input: FinancialAnalysisInput, latest: FinancialPeriod | null): number | null {
  if (isFiniteNumber(input.market?.marketCap)) return input.market.marketCap;
  const shares = firstFinite(input.market?.sharesOutstanding, latest?.currentSharesOutstanding, latest?.sharesDiluted);
  return isFiniteNumber(input.market?.price) && isFiniteNumber(shares) ? input.market.price * shares : null;
}

function deriveEnterpriseValue(input: FinancialAnalysisInput, latest: FinancialPeriod | null, marketCap: number | null): number | null {
  if (isFiniteNumber(input.market?.enterpriseValue)) return input.market.enterpriseValue;
  if (!isFiniteNumber(marketCap) || !isFiniteNumber(latest?.totalDebt) || !isFiniteNumber(latest.cashAndEquivalents)) return null;
  return marketCap + latest.totalDebt - latest.cashAndEquivalents;
}

function deriveValuationMetrics(
  input: FinancialAnalysisInput,
  latest: FinancialPeriod | null,
  simpleFcf: number | null,
  epsGrowth: number | null,
): ValuationMetrics {
  const marketCap = deriveMarketCap(input, latest);
  const enterpriseValue = deriveEnterpriseValue(input, latest, marketCap);
  const revenue = latest?.revenue ?? null;
  const netIncome = latest?.netIncome ?? null;
  const equity = latest?.totalEquity ?? null;
  const ebitda = firstFinite(
    latest?.ebitda,
    isFiniteNumber(latest?.operatingIncome) && isFiniteNumber(latest?.depreciationAndAmortization)
      ? latest.operatingIncome + latest.depreciationAndAmortization
      : null,
  );
  const pe = isFiniteNumber(netIncome) && netIncome > 0 ? safeDivide(marketCap, netIncome) : null;
  const growth = firstFinite(input.estimates?.nextYearEpsGrowth, epsGrowth);
  return {
    marketCap,
    enterpriseValue,
    priceEarnings: pe,
    priceSales: isFiniteNumber(revenue) && revenue > 0 ? safeDivide(marketCap, revenue) : null,
    priceBook: isFiniteNumber(equity) && equity > 0 ? safeDivide(marketCap, equity) : null,
    evSales: isFiniteNumber(revenue) && revenue > 0 ? safeDivide(enterpriseValue, revenue) : null,
    evEbitda: isFiniteNumber(ebitda) && ebitda > 0 ? safeDivide(enterpriseValue, ebitda) : null,
    freeCashFlowYield: isFiniteNumber(marketCap) && marketCap > 0 ? safeDivide(simpleFcf, marketCap) : null,
    earningsYield: isFiniteNumber(marketCap) && marketCap > 0 ? safeDivide(netIncome, marketCap) : null,
    peg: isFiniteNumber(pe) && isFiniteNumber(growth) && growth > 0 ? pe / (growth * 100) : null,
  };
}

function derivedProvenance(source: string, periodEnd: string | undefined, inputs: string[], note?: string): MetricProvenance {
  return { source, valueKind: "derived", periodEnd, inputs, note };
}

function addMissingIfNull(
  missingData: MissingDataItem[],
  value: number | null,
  field: string,
  reason: string,
  severity: "low" | "medium" | "high" = "medium",
): void {
  if (value === null) addMissingData(missingData, field, reason, "metric", severity);
}

export function computeFinancialMetrics(input: FinancialAnalysisInput): FinancialMetrics {
  const annual = sortFinancialPeriods(input.annualPeriods);
  const latestAnnual = annual.at(-1) ?? null;
  const previousAnnual = annual.at(-2) ?? null;
  const latest = input.trailingTwelveMonths ?? latestAnnual;
  const priorTtmCandidate = input.trailingTwelveMonths ? input.priorTrailingTwelveMonths ?? null : null;
  const priorTtm = comparableTtmPeriods(latest, priorTtmCandidate) ? priorTtmCandidate : null;
  const growthComparison = priorTtm ?? previousAnnual;
  const growthLatest = priorTtm ? latest : latestAnnual;
  const trendComparison = input.trailingTwelveMonths ? priorTtm : previousAnnual;
  const returnBalanceComparison = input.trailingTwelveMonths
    ? comparableBalancePeriods(latest, priorTtm) ? priorTtm : null
    : previousAnnual;
  const missingData: MissingDataItem[] = [];
  if (!latest) addMissingData(missingData, "annualPeriods", "No reliable financial period is available.", "metric", "high");

  const simpleFcf = deriveSimpleFreeCashFlow(latest);
  const tax = normalizedTaxRate(annual);
  const fcff = deriveFcff(latest, tax.rate);
  const fcfe = deriveFcfe(latest);
  const revenue = latest?.revenue ?? null;
  const netIncome = latest?.netIncome ?? null;
  const operatingIncome = latest?.operatingIncome ?? null;
  const ebitda = firstFinite(
    latest?.ebitda,
    isFiniteNumber(operatingIncome) && isFiniteNumber(latest?.depreciationAndAmortization)
      ? operatingIncome + latest.depreciationAndAmortization
      : null,
  );
  const averageCapital = average(investedCapital(latest), investedCapital(returnBalanceComparison));
  const averageEquity = average(latest?.totalEquity, returnBalanceComparison?.totalEquity);
  const averageAssets = average(latest?.totalAssets, returnBalanceComparison?.totalAssets);
  const nopat = isFiniteNumber(operatingIncome) ? operatingIncome * (1 - tax.rate) : null;
  const grossMargin = safeDivide(latest?.grossProfit, revenue);
  const operatingMargin = safeDivide(operatingIncome, revenue);
  const priorGrossMargin = safeDivide(trendComparison?.grossProfit, trendComparison?.revenue);
  const priorOperatingMargin = safeDivide(trendComparison?.operatingIncome, trendComparison?.revenue);
  const annualFcfs = annual.map(deriveSimpleFreeCashFlow);
  const threeYearPrior = annual.at(-4) ?? null;
  const fiveYearPrior = annual.at(-6) ?? null;
  const latestFcfPerShare = safeDivide(deriveSimpleFreeCashFlow(latestAnnual), latestAnnual?.sharesDiluted);
  const priorFcfPerShare = safeDivide(deriveSimpleFreeCashFlow(threeYearPrior), threeYearPrior?.sharesDiluted);
  const marketCap = deriveMarketCap(input, latest);
  const dividends = isFiniteNumber(latest?.dividendsPaid) ? Math.abs(latest.dividendsPaid) : null;
  const dividendGrowthLatest = priorTtm
    ? dividends
    : isFiniteNumber(latestAnnual?.dividendsPaid) ? Math.abs(latestAnnual.dividendsPaid) : null;
  const priorDividends = isFiniteNumber(growthComparison?.dividendsPaid) ? Math.abs(growthComparison.dividendsPaid) : null;
  const threeYearDividends = isFiniteNumber(threeYearPrior?.dividendsPaid) ? Math.abs(threeYearPrior.dividendsPaid) : null;
  const netDebt = isFiniteNumber(latest?.totalDebt) && isFiniteNumber(latest.cashAndEquivalents)
    ? latest.totalDebt - latest.cashAndEquivalents
    : null;
  const roic = isFiniteNumber(averageCapital) && averageCapital > 0 ? safeDivide(nopat, averageCapital) : null;
  const assumedWacc = input.dcfAssumptions?.discountRate;

  const growth = {
    revenueGrowthYoY: calculateGrowth(growthLatest?.revenue, growthComparison?.revenue),
    revenueCagr3y: calculateCagr(threeYearPrior?.revenue, latestAnnual?.revenue, 3),
    revenueCagr5y: calculateCagr(fiveYearPrior?.revenue, latestAnnual?.revenue, 5),
    epsGrowthYoY: calculateGrowth(latestAnnual?.epsDiluted, previousAnnual?.epsDiluted),
    epsCagr3y: calculateCagr(threeYearPrior?.epsDiluted, latestAnnual?.epsDiluted, 3),
    freeCashFlowGrowthYoY: calculateGrowth(deriveSimpleFreeCashFlow(growthLatest), deriveSimpleFreeCashFlow(growthComparison)),
    freeCashFlowCagr3y: calculateCagr(deriveSimpleFreeCashFlow(threeYearPrior), deriveSimpleFreeCashFlow(latestAnnual), 3),
    freeCashFlowPerShareCagr3y: calculateCagr(priorFcfPerShare, latestFcfPerShare, 3),
    revenueGrowthBasis: input.trailingTwelveMonths && priorTtm ? "TTM_YOY" as const : latestAnnual && previousAnnual ? "ANNUAL_YOY" as const : "UNAVAILABLE" as const,
    freeCashFlowGrowthBasis: input.trailingTwelveMonths && priorTtm ? "TTM_YOY" as const : latestAnnual && previousAnnual ? "ANNUAL_YOY" as const : "UNAVAILABLE" as const,
  };

  const valuation = deriveValuationMetrics(input, latest, simpleFcf, growth.epsGrowthYoY);
  const metrics: FinancialMetrics = {
    latestPeriod: latest,
    previousPeriod: growthComparison,
    margins: {
      grossMargin,
      operatingMargin,
      ebitdaMargin: safeDivide(ebitda, revenue),
      netMargin: safeDivide(netIncome, revenue),
      freeCashFlowMargin: safeDivide(simpleFcf, revenue),
      operatingCashFlowMargin: safeDivide(latest?.operatingCashFlow, revenue),
    },
    growth,
    ratios: {
      currentRatio: safeDivide(latest?.currentAssets, latest?.currentLiabilities),
      debtToEquity: isFiniteNumber(latest?.totalDebt) && isFiniteNumber(latest?.totalEquity) && latest.totalEquity > 0
        ? latest.totalDebt / latest.totalEquity
        : null,
      netDebt,
      netDebtToEbitda: isFiniteNumber(netDebt) && isFiniteNumber(ebitda) && ebitda > 0 ? netDebt / ebitda : null,
      interestCoverage: isFiniteNumber(operatingIncome) && isFiniteNumber(latest?.interestExpense) && latest.interestExpense !== 0
        ? operatingIncome / Math.abs(latest.interestExpense)
        : null,
      returnOnEquity: isFiniteNumber(averageEquity) && averageEquity > 0 ? safeDivide(netIncome, averageEquity) : null,
      returnOnAssets: isFiniteNumber(averageAssets) && averageAssets > 0 ? safeDivide(netIncome, averageAssets) : null,
      returnOnInvestedCapital: roic,
      returnOnInvestedCapitalSpread: isFiniteNumber(roic) && isFiniteNumber(assumedWacc) ? roic - assumedWacc : null,
      cashConversion: safeDivide(simpleFcf, netIncome),
      cashToDebt: safeDivide(latest?.cashAndEquivalents, latest?.totalDebt),
      equityToAssets: safeDivide(latest?.totalEquity, latest?.totalAssets),
    },
    valuation,
    trends: {
      operatingMarginChangeYoY: isFiniteNumber(operatingMargin) && isFiniteNumber(priorOperatingMargin)
        ? operatingMargin - priorOperatingMargin
        : null,
      grossMarginChangeYoY: isFiniteNumber(grossMargin) && isFiniteNumber(priorGrossMargin)
        ? grossMargin - priorGrossMargin
        : null,
      revenueAcceleration: null,
      sharesDilutionYoY: calculateGrowth(latestAnnual?.sharesDiluted, previousAnnual?.sharesDiluted),
    },
    cashFlow: {
      simpleFreeCashFlow: simpleFcf,
      fcff,
      fcfe,
      normalizedTaxRate: tax.rate,
      taxRateSource: tax.source,
      cfoToNetIncome: safeDivide(latest?.operatingCashFlow, netIncome),
      freeCashFlowToNetIncome: safeDivide(simpleFcf, netIncome),
      accrualRatio: isFiniteNumber(netIncome) && isFiniteNumber(latest?.operatingCashFlow) && isFiniteNumber(averageAssets)
        ? (netIncome - latest.operatingCashFlow) / averageAssets
        : null,
      stockBasedCompensationToRevenue: safeDivide(latest?.stockBasedCompensation, revenue),
      operatingMarginStability: stability(annual.slice(-5).map((period) => safeDivide(period.operatingIncome, period.revenue))),
      grossMarginStability: stability(annual.slice(-5).map((period) => safeDivide(period.grossProfit, period.revenue))),
      freeCashFlowStability: stability(annualFcfs.slice(-5)),
      dividendYield: safeDivide(dividends, marketCap),
      dividendPayoutRatio: safeDivide(dividends, netIncome),
      freeCashFlowPayoutRatio: safeDivide(dividends, simpleFcf),
      dividendGrowthYoY: calculateGrowth(dividendGrowthLatest, priorDividends),
      dividendCagr3y: calculateCagr(threeYearDividends, dividends, 3),
    },
    provenance: {
      ...(latest?.provenance ?? {}),
      simpleFreeCashFlow: derivedProvenance("StockBox deterministic formula", latest?.periodEndDate, ["operatingCashFlow", "capitalExpenditures"], "CFO - abs(capex)"),
      fcff: derivedProvenance("StockBox deterministic formula", latest?.periodEndDate, ["operatingCashFlow", "interestExpense", "normalizedTaxRate", "capitalExpenditures"]),
      marketCap: derivedProvenance("Market data", input.market?.priceDate ?? undefined, ["price", "sharesOutstanding"]),
      revenueGrowthYoY: {
        ...derivedProvenance(
          "StockBox deterministic formula",
          growthLatest?.periodEndDate,
          ["latestRevenue", "priorComparableRevenue"],
          growth.revenueGrowthBasis === "TTM_YOY" ? "TTM versus prior comparable TTM" : "Annual YoY fallback",
        ),
        periodBasis: growth.revenueGrowthBasis === "TTM_YOY" ? latest?.periodBasis : "FY",
      },
      freeCashFlowGrowthYoY: {
        ...derivedProvenance(
          "StockBox deterministic formula",
          growthLatest?.periodEndDate,
          ["latestSimpleFreeCashFlow", "priorComparableSimpleFreeCashFlow"],
          growth.freeCashFlowGrowthBasis === "TTM_YOY" ? "TTM versus prior comparable TTM" : "Annual YoY fallback",
        ),
        periodBasis: growth.freeCashFlowGrowthBasis === "TTM_YOY" ? latest?.periodBasis : "FY",
      },
    },
    missingData,
  };

  addMissingIfNull(missingData, revenue, "revenue", "Revenue is unavailable for the latest reliable period.", "high");
  addMissingIfNull(missingData, simpleFcf, "simpleFreeCashFlow", "CFO and capex are required for simple free cash flow.", "high");
  addMissingIfNull(missingData, valuation.marketCap, "marketCap", "Market cap requires a reported value or both price and shares.");
  addMissingIfNull(missingData, valuation.enterpriseValue, "enterpriseValue", "EV requires market cap, reported debt and reported cash.");
  addMissingIfNull(missingData, growth.revenueGrowthYoY, "revenueGrowthYoY", "Two positive, comparable annual or TTM revenue periods are required.");
  if (input.trailingTwelveMonths && !returnBalanceComparison) {
    addMissingData(missingData, "returnMetricAverageBalances", "Comparable current and prior-year instant balance dates are required for TTM ROE, ROA and ROIC.", "metric", "high");
  }
  if (tax.source === "fallback_assumption") {
    addMissingData(missingData, "normalizedTaxRate", "No stable reported effective tax rate; a labelled 21% fallback is used only for FCFF.", "dcf", "medium");
  }
  return metrics;
}
