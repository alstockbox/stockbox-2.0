import type {
  CurrencyAlignmentStatus,
  FinancialAnalysisInput,
  FinancialMetrics,
  FinancialPeriod,
  MetricProvenance,
  MissingDataItem,
  ValuationMetrics,
} from "./types";
import { dataDateStatus, DATA_FRESHNESS_THRESHOLDS_DAYS } from "./freshness";
import { economicCurrencyCode, quotePriceToEconomic } from "./currency-units";
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
const FUTURE_MARKET_PRICE_TOLERANCE_DAYS = 1;

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

function shareBasisComparable(left: FinancialPeriod | null | undefined, right: FinancialPeriod | null | undefined): boolean {
  if (!left || !right) return false;
  const leftScale = left.shareBasisScale;
  const rightScale = right.shareBasisScale;
  if (!isFiniteNumber(leftScale) && !isFiniteNumber(rightScale)) return true;
  if (!isFiniteNumber(leftScale) || !isFiniteNumber(rightScale)) return false;
  return Math.abs(leftScale - rightScale) / Math.max(Math.abs(leftScale), Math.abs(rightScale), 1) <= 0.03;
}

function normalizedCurrency(value: string | null | undefined): string | null {
  return economicCurrencyCode(value);
}

export function valuationCurrencyAlignment(
  input: FinancialAnalysisInput,
  latest: FinancialPeriod | null,
): CurrencyAlignmentStatus {
  const financialCurrency = normalizedCurrency(
    latest?.currency ?? input.company.reportingCurrency ?? input.company.currency,
  );
  const legacyCurrency = !input.company.reportingCurrency && !input.company.tradingCurrency
    ? input.company.currency
    : undefined;
  const marketCurrency = normalizedCurrency(
    input.market?.currency ?? input.company.tradingCurrency ?? legacyCurrency,
  );
  if (!financialCurrency || !marketCurrency) return "unknown";
  return financialCurrency === marketCurrency ? "aligned" : "mismatch";
}

export function hasValuationCurrencyMismatch(
  input: FinancialAnalysisInput,
  latest: FinancialPeriod | null,
): boolean {
  return valuationCurrencyAlignment(input, latest) === "mismatch";
}

export function hasStaleMarketPriceForValuation(input: FinancialAnalysisInput): boolean {
  if (!input.market?.priceDate) return false;
  const analysisDate = input.analysisDate ?? new Date().toISOString();
  const age = (Date.parse(analysisDate) - Date.parse(input.market.priceDate)) / 86_400_000;
  if (!Number.isFinite(age)) return true;
  if (age < -FUTURE_MARKET_PRICE_TOLERANCE_DAYS) return true;
  return Math.max(0, Math.floor(age)) > DATA_FRESHNESS_THRESHOLDS_DAYS.marketPrice;
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
  const endGap = (Date.parse(current.periodEndDate) - Date.parse(prior.periodEndDate)) / 86_400_000;
  if (!Number.isFinite(endGap) || endGap < 330 || endGap > 400) return false;
  if (current.periodBasis === "TTM_REPORTED") return true;
  if (!isFiniteNumber(current.currentYtdDurationDays) || !isFiniteNumber(prior.currentYtdDurationDays)) return false;
  return Math.abs(current.currentYtdDurationDays - prior.currentYtdDurationDays) <= 15;
}

function periodSpanYears(older: FinancialPeriod | null, newer: FinancialPeriod | null): number | null {
  if (!older || !newer) return null;
  if (older.periodEndDate && newer.periodEndDate) {
    const days = (Date.parse(newer.periodEndDate) - Date.parse(older.periodEndDate)) / 86_400_000;
    return Number.isFinite(days) && days > 0 ? days / 365.2425 : null;
  }
  if (isFiniteNumber(older.fiscalYear) && isFiniteNumber(newer.fiscalYear)) {
    const years = newer.fiscalYear - older.fiscalYear;
    return years > 0 ? years : null;
  }
  return null;
}

function comparableAnnualPeriod(
  periods: FinancialPeriod[],
  newer: FinancialPeriod | null,
  targetYears: number,
): { period: FinancialPeriod; years: number } | null {
  if (!newer) return null;
  const tolerance = targetYears === 1 ? 0.15 : 0.35;
  const candidates = periods
    .filter((period) => period !== newer)
    .flatMap((period) => {
      const years = periodSpanYears(period, newer);
      return years !== null && Math.abs(years - targetYears) <= tolerance
        ? [{ period, years }]
        : [];
    })
    .sort((left, right) => Math.abs(left.years - targetYears) - Math.abs(right.years - targetYears));
  return candidates[0] ?? null;
}

function cagrBetween(
  older: FinancialPeriod | null,
  newer: FinancialPeriod | null,
  olderValue: number | null | undefined,
  newerValue: number | null | undefined,
): number | null {
  const years = periodSpanYears(older, newer);
  return years === null ? null : calculateCagr(olderValue, newerValue, years);
}

export function contiguousAnnualHistory(periods: FinancialPeriod[], maximum = 5): FinancialPeriod[] {
  const ordered = sortFinancialPeriods(periods);
  const contiguous: FinancialPeriod[] = [];
  for (let index = ordered.length - 1; index >= 0 && contiguous.length < maximum; index -= 1) {
    const period = ordered[index];
    const newer = contiguous[0];
    if (newer && !comparableAnnualPeriod([period], newer, 1)) break;
    contiguous.unshift(period);
  }
  return contiguous;
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

export function deriveFcff(period: FinancialPeriod | null, taxRate: number): number | null {
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

function freshnessAllows(
  input: FinancialAnalysisInput,
  date: string | null | undefined,
  thresholdDays: number,
): boolean {
  if (!input.analysisDate) return true;
  return dataDateStatus(date, input.analysisDate, thresholdDays).status === "current";
}

function currentSharesForValuation(
  input: FinancialAnalysisInput,
  latest: FinancialPeriod | null,
): number | null {
  if (
    isFiniteNumber(input.market?.sharesOutstanding)
    && freshnessAllows(
      input,
      input.market?.sharesOutstandingAsOf ?? input.market?.priceDate,
      DATA_FRESHNESS_THRESHOLDS_DAYS.sharesOutstanding,
    )
  ) {
    return input.market.sharesOutstanding;
  }
  if (
    isFiniteNumber(latest?.currentSharesOutstanding)
    && freshnessAllows(
      input,
      latest?.balanceSheetDate ?? latest?.periodEndDate,
      DATA_FRESHNESS_THRESHOLDS_DAYS.sharesOutstanding,
    )
  ) {
    return latest.currentSharesOutstanding;
  }
  return null;
}

export function currentSharesForDcf(
  input: FinancialAnalysisInput,
  latest: FinancialPeriod | null,
): number | null {
  return currentSharesForValuation(input, latest);
}

export function marketCapShareBasisDifference(
  input: FinancialAnalysisInput,
  latest: FinancialPeriod | null,
): number | null {
  const marketCapStatus = dataDateStatus(
    input.market?.marketCapAsOf ?? input.market?.priceDate,
    input.analysisDate ?? new Date().toISOString(),
    DATA_FRESHNESS_THRESHOLDS_DAYS.marketCap,
  );
  if (marketCapStatus.status !== "current") return null;
  const marketCapDate = input.market?.marketCapAsOf ?? input.market?.priceDate;
  const priceDate = input.market?.priceDate;
  if (!marketCapDate || !priceDate) return null;
  const observationGapDays = Math.abs(Date.parse(marketCapDate) - Date.parse(priceDate)) / 86_400_000;
  if (!Number.isFinite(observationGapDays) || observationGapDays > 1) return null;
  const sharesDate = input.market?.sharesOutstandingAsOf;
  if (!sharesDate) return null;
  const shareObservationGapDays = Math.abs(Date.parse(sharesDate) - Date.parse(marketCapDate)) / 86_400_000;
  if (!Number.isFinite(shareObservationGapDays) || shareObservationGapDays > 7) return null;
  const marketCap = input.market?.marketCap;
  const shares = currentSharesForValuation(input, latest);
  const economicPrice = quotePriceToEconomic(input.market?.price, input.market?.currency ?? input.company.tradingCurrency);
  const capCurrency = economicCurrencyCode(input.market?.marketCapCurrency ?? input.market?.currency);
  const priceCurrency = economicCurrencyCode(input.market?.currency ?? input.company.tradingCurrency);
  if (!isFiniteNumber(marketCap) || marketCap <= 0 || !isFiniteNumber(shares) || shares <= 0 || !isFiniteNumber(economicPrice) || economicPrice <= 0) return null;
  if (!capCurrency || !priceCurrency || capCurrency !== priceCurrency) return null;
  const priceTimesShares = economicPrice * shares;
  return Math.abs(marketCap - priceTimesShares) / Math.max(Math.abs(marketCap), Math.abs(priceTimesShares), 1);
}

function marketCapCurrencyMatches(input: FinancialAnalysisInput, latest: FinancialPeriod | null): boolean {
  const capCurrency = normalizedCurrency(input.market?.marketCapCurrency ?? input.market?.currency);
  const financialCurrency = normalizedCurrency(latest?.currency ?? input.company.reportingCurrency ?? input.company.currency);
  return Boolean(capCurrency && financialCurrency && capCurrency === financialCurrency);
}

function deriveMarketCap(input: FinancialAnalysisInput, latest: FinancialPeriod | null): number | null {
  const directMarketCapCurrent = freshnessAllows(
    input,
    input.market?.marketCapAsOf ?? input.market?.priceDate,
    DATA_FRESHNESS_THRESHOLDS_DAYS.marketCap,
  );
  if (isFiniteNumber(input.market?.marketCap) && directMarketCapCurrent && marketCapCurrencyMatches(input, latest)) {
    return input.market.marketCap;
  }
  const shares = currentSharesForValuation(input, latest);
  const economicPrice = quotePriceToEconomic(input.market?.price, input.market?.currency ?? input.company.tradingCurrency);
  return isFiniteNumber(economicPrice) && isFiniteNumber(shares) ? economicPrice * shares : null;
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
  const commonEarnings = firstFinite(latest?.netIncomeCommonStockholders, latest?.netIncome);
  const equity = latest?.totalEquity ?? null;
  const tangibleBook = input.specialized?.kind === "bank"
    ? input.specialized.tangibleCommonEquity.value
    : latest?.tangibleBookValue ?? null;
  const ebitda = firstFinite(
    latest?.ebitda,
    isFiniteNumber(latest?.operatingIncome) && isFiniteNumber(latest?.depreciationAndAmortization)
      ? latest.operatingIncome + latest.depreciationAndAmortization
      : null,
  );
  const pe = isFiniteNumber(commonEarnings) && commonEarnings > 0 ? safeDivide(marketCap, commonEarnings) : null;
  const growth = firstFinite(input.estimates?.nextYearEpsGrowth, epsGrowth);
  return {
    marketCap,
    enterpriseValue,
    priceEarnings: pe,
    priceSales: isFiniteNumber(revenue) && revenue > 0 ? safeDivide(marketCap, revenue) : null,
    priceBook: isFiniteNumber(equity) && equity > 0 ? safeDivide(marketCap, equity) : null,
    priceTangibleBook: isFiniteNumber(tangibleBook) && tangibleBook > 0 ? safeDivide(marketCap, tangibleBook) : null,
    evSales: isFiniteNumber(revenue) && revenue > 0 ? safeDivide(enterpriseValue, revenue) : null,
    evEbitda: isFiniteNumber(ebitda) && ebitda > 0 ? safeDivide(enterpriseValue, ebitda) : null,
    freeCashFlowYield: isFiniteNumber(marketCap) && marketCap > 0 ? safeDivide(simpleFcf, marketCap) : null,
    earningsYield: isFiniteNumber(marketCap) && marketCap > 0 ? safeDivide(commonEarnings, marketCap) : null,
    peg: isFiniteNumber(pe) && isFiniteNumber(growth) && growth > 0 ? pe / (growth * 100) : null,
  };
}

function unavailableValuationMetrics(): ValuationMetrics {
  return {
    marketCap: null,
    enterpriseValue: null,
    priceEarnings: null,
    priceSales: null,
    priceBook: null,
    priceTangibleBook: null,
    evSales: null,
    evEbitda: null,
    freeCashFlowYield: null,
    earningsYield: null,
    peg: null,
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
  const previousAnnualMatch = comparableAnnualPeriod(annual, latestAnnual, 1);
  const previousAnnual = previousAnnualMatch?.period ?? null;
  const twoYearsPrior = comparableAnnualPeriod(annual, previousAnnual, 1)?.period ?? null;
  const latest = input.trailingTwelveMonths ?? latestAnnual;
  const priorTtmCandidate = input.trailingTwelveMonths ? input.priorTrailingTwelveMonths ?? null : null;
  const priorTtm = comparableTtmPeriods(latest, priorTtmCandidate) ? priorTtmCandidate : null;
  const growthComparison = priorTtm ?? previousAnnual;
  const growthLatest = priorTtm ? latest : latestAnnual;
  const trendComparison = input.trailingTwelveMonths ? priorTtm : previousAnnual;
  const returnBalanceComparison = input.trailingTwelveMonths
    ? comparableBalancePeriods(latest, priorTtm)
      ? priorTtm
      : comparableBalancePeriods(latest, input.priorComparableBalanceSheet ?? null)
        ? input.priorComparableBalanceSheet ?? null
        : null
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
  const contiguousAnnual = contiguousAnnualHistory(annual);
  const annualFcfs = contiguousAnnual.map(deriveSimpleFreeCashFlow);
  const threeYearMatch = comparableAnnualPeriod(annual, latestAnnual, 3);
  const fiveYearMatch = comparableAnnualPeriod(annual, latestAnnual, 5);
  const threeYearPrior = threeYearMatch?.period ?? null;
  const fiveYearPrior = fiveYearMatch?.period ?? null;
  const annualEpsYoYComparable = shareBasisComparable(latestAnnual, previousAnnual);
  const threeYearShareBasisComparable = shareBasisComparable(latestAnnual, threeYearPrior);
  const latestFcfPerShare = threeYearShareBasisComparable ? safeDivide(deriveSimpleFreeCashFlow(latestAnnual), latestAnnual?.sharesDiluted) : null;
  const priorFcfPerShare = threeYearShareBasisComparable ? safeDivide(deriveSimpleFreeCashFlow(threeYearPrior), threeYearPrior?.sharesDiluted) : null;
  const currencyAlignment = valuationCurrencyAlignment(input, latest);
  const currencyMismatch = currencyAlignment === "mismatch";
  const currencyUnknown = currencyAlignment === "unknown";
  const staleMarketPrice = hasStaleMarketPriceForValuation(input);
  const staleMarketCap = isFiniteNumber(input.market?.marketCap) && !freshnessAllows(
    input,
    input.market?.marketCapAsOf ?? input.market?.priceDate,
    DATA_FRESHNESS_THRESHOLDS_DAYS.marketCap,
  );
  const staleShares = isFiniteNumber(input.market?.sharesOutstanding) && !freshnessAllows(
    input,
    input.market?.sharesOutstandingAsOf ?? input.market?.priceDate,
    DATA_FRESHNESS_THRESHOLDS_DAYS.sharesOutstanding,
  );
  const marketCapCurrencyMismatch = isFiniteNumber(input.market?.marketCap)
    && !marketCapCurrencyMatches(input, latest);
  const shareBasisDifference = marketCapShareBasisDifference(input, latest);
  const materialShareBasisMismatch = isFiniteNumber(shareBasisDifference) && shareBasisDifference > 0.05;
  const blockMarketValuation = currencyAlignment !== "aligned" || staleMarketPrice || materialShareBasisMismatch;
  const marketCap = blockMarketValuation ? null : deriveMarketCap(input, latest);
  const usesReportedMarketCap = isFiniteNumber(input.market?.marketCap)
    && !staleMarketCap
    && !marketCapCurrencyMismatch
    && !materialShareBasisMismatch
    && currencyAlignment === "aligned";
  const dividends = isFiniteNumber(latest?.dividendsPaid) ? Math.abs(latest.dividendsPaid) : null;
  const dividendGrowthLatest = priorTtm
    ? dividends
    : isFiniteNumber(latestAnnual?.dividendsPaid) ? Math.abs(latestAnnual.dividendsPaid) : null;
  const priorDividends = isFiniteNumber(growthComparison?.dividendsPaid) ? Math.abs(growthComparison.dividendsPaid) : null;
  const latestAnnualDividends = isFiniteNumber(latestAnnual?.dividendsPaid) ? Math.abs(latestAnnual.dividendsPaid) : null;
  const threeYearDividends = isFiniteNumber(threeYearPrior?.dividendsPaid) ? Math.abs(threeYearPrior.dividendsPaid) : null;
  const netDebt = isFiniteNumber(latest?.totalDebt) && isFiniteNumber(latest.cashAndEquivalents)
    ? latest.totalDebt - latest.cashAndEquivalents
    : null;
  const interestCoveragePeriod = isFiniteNumber(latest?.interestExpense) ? latest : latestAnnual;
  const interestCoverageOperatingIncome = interestCoveragePeriod?.operatingIncome;
  const interestCoverageExpense = interestCoveragePeriod?.interestExpense;
  const roic = isFiniteNumber(averageCapital) && averageCapital > 0 ? safeDivide(nopat, averageCapital) : null;
  const assumedWacc = input.dcfAssumptions?.discountRate;

  const growth = {
    revenueGrowthYoY: calculateGrowth(growthLatest?.revenue, growthComparison?.revenue),
    revenueCagr3y: cagrBetween(threeYearPrior, latestAnnual, threeYearPrior?.revenue, latestAnnual?.revenue),
    revenueCagr5y: cagrBetween(fiveYearPrior, latestAnnual, fiveYearPrior?.revenue, latestAnnual?.revenue),
    epsGrowthYoY: annualEpsYoYComparable ? calculateGrowth(latestAnnual?.epsDiluted, previousAnnual?.epsDiluted) : null,
    epsCagr3y: threeYearShareBasisComparable ? cagrBetween(threeYearPrior, latestAnnual, threeYearPrior?.epsDiluted, latestAnnual?.epsDiluted) : null,
    freeCashFlowGrowthYoY: calculateGrowth(deriveSimpleFreeCashFlow(growthLatest), deriveSimpleFreeCashFlow(growthComparison)),
    freeCashFlowCagr3y: cagrBetween(threeYearPrior, latestAnnual, deriveSimpleFreeCashFlow(threeYearPrior), deriveSimpleFreeCashFlow(latestAnnual)),
    freeCashFlowPerShareCagr3y: cagrBetween(threeYearPrior, latestAnnual, priorFcfPerShare, latestFcfPerShare),
    revenueGrowthBasis: input.trailingTwelveMonths && priorTtm ? "TTM_YOY" as const : latestAnnual && previousAnnual ? "ANNUAL_YOY" as const : "UNAVAILABLE" as const,
    freeCashFlowGrowthBasis: input.trailingTwelveMonths && priorTtm ? "TTM_YOY" as const : latestAnnual && previousAnnual ? "ANNUAL_YOY" as const : "UNAVAILABLE" as const,
  };

  const valuation = blockMarketValuation
    ? unavailableValuationMetrics()
    : deriveValuationMetrics(input, latest, simpleFcf, growth.epsGrowthYoY);
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
      interestCoverage: isFiniteNumber(interestCoverageOperatingIncome) && isFiniteNumber(interestCoverageExpense) && interestCoverageExpense !== 0
        ? interestCoverageOperatingIncome / Math.abs(interestCoverageExpense)
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
      revenueAcceleration: (() => {
        const currentGrowth = calculateGrowth(latestAnnual?.revenue, previousAnnual?.revenue);
        const previousGrowth = calculateGrowth(previousAnnual?.revenue, twoYearsPrior?.revenue);
        return isFiniteNumber(currentGrowth) && isFiniteNumber(previousGrowth)
          ? currentGrowth - previousGrowth
          : null;
      })(),
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
      operatingMarginStability: stability(contiguousAnnual.map((period) => safeDivide(period.operatingIncome, period.revenue))),
      grossMarginStability: stability(contiguousAnnual.map((period) => safeDivide(period.grossProfit, period.revenue))),
      freeCashFlowStability: stability(annualFcfs),
      dividendYield: safeDivide(dividends, marketCap),
      dividendPayoutRatio: safeDivide(dividends, netIncome),
      freeCashFlowPayoutRatio: safeDivide(dividends, simpleFcf),
      dividendGrowthYoY: calculateGrowth(dividendGrowthLatest, priorDividends),
      dividendCagr3y: cagrBetween(threeYearPrior, latestAnnual, threeYearDividends, latestAnnualDividends),
    },
    provenance: {
      ...(latest?.provenance ?? {}),
      simpleFreeCashFlow: derivedProvenance("StockBox deterministic formula", latest?.periodEndDate, ["operatingCashFlow", "capitalExpenditures"], "CFO - abs(capex)"),
      fcff: derivedProvenance("StockBox deterministic formula", latest?.periodEndDate, ["operatingCashFlow", "interestExpense", "normalizedTaxRate", "capitalExpenditures"]),
      marketCap: usesReportedMarketCap
        ? { source: "Market data", provider: input.market?.provider, periodEnd: input.market?.marketCapAsOf ?? input.market?.priceDate ?? undefined, valueKind: "reported" }
        : { ...derivedProvenance("Market data", input.market?.priceDate ?? undefined, ["price", "sharesOutstanding"]), provider: input.market?.provider },
      priceTangibleBook: derivedProvenance("StockBox deterministic formula", latest?.periodEndDate, ["marketCap", "tangibleCommonEquity"]),
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

  if (currencyMismatch) {
    addMissingData(
      missingData,
      "currencyAlignment",
      "Financial and market currencies differ; valuation metrics require aligned currency data or explicit FX conversion.",
      "metric",
      "high",
    );
  }
  if (currencyUnknown) {
    addMissingData(
      missingData,
      "currencyAlignment",
      "Reporting or trading currency is unknown; valuation requires explicit aligned currencies.",
      "metric",
      "high",
    );
  }
  if (staleMarketPrice) {
    addMissingData(
      missingData,
      "marketPriceFreshness",
      "Market price data is stale or future-dated; valuation metrics require a current market price or market cap.",
      "metric",
      "high",
    );
  }
  if (staleMarketCap) {
    addMissingData(
      missingData,
      "marketCapFreshness",
      "Reported market cap is stale or future-dated and is not used as a current valuation input.",
      "metric",
      "high",
    );
  }
  if (staleShares) {
    addMissingData(
      missingData,
      "sharesOutstandingFreshness",
      "Reported shares outstanding are stale or future-dated and are not used for current market cap or per-share valuation.",
      "metric",
      "high",
    );
  }
  if (marketCapCurrencyMismatch) {
    addMissingData(
      missingData,
      "marketCapCurrency",
      "Reported market cap currency does not align with the verified financial and trading currency.",
      "metric",
      "high",
    );
  }
  if (materialShareBasisMismatch) {
    addMissingData(
      missingData,
      "shareBasisAlignment",
      "Reported market cap materially disagrees with current quote price times current shares; market-based valuation is withheld until the listing share basis is reconciled.",
      "metric",
      "high",
    );
  }
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
