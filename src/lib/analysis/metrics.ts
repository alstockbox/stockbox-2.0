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
const MAX_TTM_BALANCE_LAG_DAYS = 45;
const DEBT_FREE_INTEREST_COVERAGE_RATIO = 99;

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

export function shareBasisComparable(left: FinancialPeriod | null | undefined, right: FinancialPeriod | null | undefined): boolean {
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

function ttmBalanceAlignsWithFlow(period: FinancialPeriod | null): boolean {
  if (!period || period.form !== "TTM" || !period.periodEndDate || !period.balanceSheetDate) return false;
  const lagDays = (Date.parse(period.periodEndDate) - Date.parse(period.balanceSheetDate)) / 86_400_000;
  return Number.isFinite(lagDays) && lagDays >= 0 && lagDays <= MAX_TTM_BALANCE_LAG_DAYS;
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

export function comparableAnnualPeriod(
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
  const marketCapDate = input.market?.marketCapAsOf ?? input.market?.priceDate ?? null;
  const priceDate = input.market?.priceDate ?? null;
  if (!marketCapDate || !priceDate || marketCapDate !== priceDate) return null;
  const marketCapStatus = dataDateStatus(
    marketCapDate,
    input.analysisDate ?? new Date().toISOString(),
    DATA_FRESHNESS_THRESHOLDS_DAYS.marketCap,
  );
  if (marketCapStatus.status !== "current") return null;
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
    ? input.specialized.tangibleCommonEquity?.value ?? null
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

function providerReportedValuation(input: FinancialAnalysisInput): ValuationMetrics {
  const reported = input.reportedValuation;
  if (!reported || !freshnessAllows(input, reported.asOfDate, DATA_FRESHNESS_THRESHOLDS_DAYS.marketCap)) {
    return unavailableValuationMetrics();
  }
  const positive = (value: number | null | undefined) => isFiniteNumber(value) && value > 0 ? value : null;
  const pe = positive(reported.priceEarnings);
  const sameFcfCurrency = normalizedCurrency(reported.marketCapCurrency) !== null
    && normalizedCurrency(reported.marketCapCurrency) === normalizedCurrency(reported.freeCashFlowCurrency);
  const fcfCurrent = freshnessAllows(input, reported.freeCashFlowDate, DATA_FRESHNESS_THRESHOLDS_DAYS.financialFlow);
  const fcfYield = sameFcfCurrency && fcfCurrent && positive(reported.marketCap) !== null && isFiniteNumber(reported.freeCashFlow)
    ? safeDivide(reported.freeCashFlow, reported.marketCap)
    : null;
  return {
    marketCap: null,
    enterpriseValue: null,
    priceEarnings: pe,
    priceSales: positive(reported.priceSales),
    priceBook: positive(reported.priceBook),
    priceTangibleBook: null,
    evSales: positive(reported.evSales),
    evEbitda: positive(reported.evEbitda),
    freeCashFlowYield: fcfYield,
    earningsYield: pe ? 1 / pe : null,
    peg: positive(reported.peg),
  };
}

function mergeValuationMetrics(primary: ValuationMetrics, fallback: ValuationMetrics): ValuationMetrics {
  return Object.fromEntries(Object.keys(primary).map((key) => {
    const metric = key as keyof ValuationMetrics;
    return [metric, firstFinite(primary[metric], fallback[metric])];
  })) as ValuationMetrics;
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
  const currentTtmBalanceAligned = input.trailingTwelveMonths ? ttmBalanceAlignsWithFlow(latest) : false;
  const priorTtmBalanceAligned = input.trailingTwelveMonths ? ttmBalanceAlignsWithFlow(priorTtm) : false;
  const growthComparison = priorTtm ?? previousAnnual;
  const growthLatest = priorTtm ? latest : latestAnnual;
  const trendComparison = input.trailingTwelveMonths ? priorTtm : previousAnnual;
  const ttmReturnComparison = input.trailingTwelveMonths && currentTtmBalanceAligned && priorTtmBalanceAligned && comparableBalancePeriods(latest, priorTtm)
    ? priorTtm
    : null;
  const returnUsesTtm = Boolean(ttmReturnComparison);
  const returnLatest = returnUsesTtm ? latest : latestAnnual;
  const returnBalanceComparison = returnUsesTtm ? ttmReturnComparison : previousAnnual;
  const returnPeriodBasis = returnUsesTtm ? returnLatest?.periodBasis : "FY";
  const missingData: MissingDataItem[] = [];
  if (!latest) addMissingData(missingData, "annualPeriods", "No reliable financial period is available.", "metric", "high");

  const ttmSimpleFcf = deriveSimpleFreeCashFlow(latest);
  const useTtmCashFlow = Boolean(
    input.trailingTwelveMonths
    && isFiniteNumber(latest?.operatingCashFlow)
    && isFiniteNumber(ttmSimpleFcf)
    && isFiniteNumber(latest?.revenue)
    && isFiniteNumber(latest?.netIncome)
  );
  const cashFlowLatest = useTtmCashFlow ? latest : latestAnnual;
  const simpleFcf = deriveSimpleFreeCashFlow(cashFlowLatest);
  const tax = normalizedTaxRate(annual);
  const fcff = deriveFcff(cashFlowLatest, tax.rate);
  const fcfe = deriveFcfe(cashFlowLatest);
  const revenue = latest?.revenue ?? null;
  const netIncome = latest?.netIncome ?? null;
  const operatingIncome = latest?.operatingIncome ?? null;
  const cashFlowRevenue = cashFlowLatest?.revenue ?? null;
  const cashFlowNetIncome = cashFlowLatest?.netIncome ?? null;
  const cashFlowOperatingCashFlow = cashFlowLatest?.operatingCashFlow ?? null;
  const ebitda = firstFinite(
    latest?.ebitda,
    isFiniteNumber(operatingIncome) && isFiniteNumber(latest?.depreciationAndAmortization)
      ? operatingIncome + latest.depreciationAndAmortization
      : null,
  );
  const returnNetIncome = returnLatest?.netIncome ?? null;
  const returnOperatingIncome = returnLatest?.operatingIncome ?? null;
  const averageCapital = average(investedCapital(returnLatest), investedCapital(returnBalanceComparison));
  const averageEquity = average(returnLatest?.totalEquity, returnBalanceComparison?.totalEquity);
  const averageAssets = average(returnLatest?.totalAssets, returnBalanceComparison?.totalAssets);
  const nopat = isFiniteNumber(returnOperatingIncome) ? returnOperatingIncome * (1 - tax.rate) : null;
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
  const currentNetDebt = isFiniteNumber(latest?.totalDebt) && isFiniteNumber(latest.cashAndEquivalents)
    ? latest.totalDebt - latest.cashAndEquivalents
    : null;
  const annualOperatingIncome = latestAnnual?.operatingIncome ?? null;
  const annualEbitda = firstFinite(
    latestAnnual?.ebitda,
    isFiniteNumber(annualOperatingIncome) && isFiniteNumber(latestAnnual?.depreciationAndAmortization)
      ? annualOperatingIncome + latestAnnual.depreciationAndAmortization
      : null,
  );
  const annualNetDebt = isFiniteNumber(latestAnnual?.totalDebt) && isFiniteNumber(latestAnnual.cashAndEquivalents)
    ? latestAnnual.totalDebt - latestAnnual.cashAndEquivalents
    : null;
  const useTtmLeverage = Boolean(input.trailingTwelveMonths && currentTtmBalanceAligned && isFiniteNumber(currentNetDebt) && isFiniteNumber(ebitda) && ebitda > 0);
  const netDebt = currentNetDebt ?? annualNetDebt;
  const leverageNetDebt = useTtmLeverage ? currentNetDebt : annualNetDebt;
  const leverageEbitda = useTtmLeverage ? ebitda : annualEbitda;
  const netDebtToEbitda = isFiniteNumber(leverageNetDebt) && isFiniteNumber(leverageEbitda) && leverageEbitda > 0 ? leverageNetDebt / leverageEbitda : null;
  const useTtmInterestCoverage = Boolean(input.trailingTwelveMonths && isFiniteNumber(operatingIncome) && isFiniteNumber(latest?.interestExpense) && latest.interestExpense !== 0);
  const interestCoverageOperatingIncome = useTtmInterestCoverage ? operatingIncome : annualOperatingIncome;
  const interestCoverageExpense = useTtmInterestCoverage ? latest?.interestExpense : latestAnnual?.interestExpense;
  const interestCoverage = isFiniteNumber(interestCoverageOperatingIncome) && isFiniteNumber(interestCoverageExpense)
    ? interestCoverageExpense === 0
      ? interestCoverageOperatingIncome > 0 ? DEBT_FREE_INTEREST_COVERAGE_RATIO : null
      : interestCoverageOperatingIncome / Math.abs(interestCoverageExpense)
    : null;
  const useTtmCashToDebt = Boolean(input.trailingTwelveMonths && currentTtmBalanceAligned && isFiniteNumber(latest?.cashAndEquivalents) && isFiniteNumber(latest?.totalDebt) && latest.totalDebt !== 0);
  const cashToDebtPeriod = useTtmCashToDebt ? latest : latestAnnual;
  const cashToDebt = safeDivide(cashToDebtPeriod?.cashAndEquivalents, cashToDebtPeriod?.totalDebt);
  const useTtmCurrentRatio = Boolean(input.trailingTwelveMonths && currentTtmBalanceAligned && isFiniteNumber(latest?.currentAssets) && isFiniteNumber(latest?.currentLiabilities) && latest.currentLiabilities !== 0);
  const currentRatioPeriod = useTtmCurrentRatio ? latest : latestAnnual;
  const currentRatio = safeDivide(currentRatioPeriod?.currentAssets, currentRatioPeriod?.currentLiabilities);
  const useTtmDebtToEquity = Boolean(input.trailingTwelveMonths && currentTtmBalanceAligned && isFiniteNumber(latest?.totalDebt) && isFiniteNumber(latest?.totalEquity) && latest.totalEquity > 0);
  const debtToEquityPeriod = useTtmDebtToEquity ? latest : latestAnnual;
  const debtToEquity = isFiniteNumber(debtToEquityPeriod?.totalDebt) && isFiniteNumber(debtToEquityPeriod?.totalEquity) && debtToEquityPeriod.totalEquity > 0
    ? debtToEquityPeriod.totalDebt / debtToEquityPeriod.totalEquity
    : null;
  const useTtmEquityToAssets = Boolean(input.trailingTwelveMonths && currentTtmBalanceAligned && isFiniteNumber(latest?.totalEquity) && isFiniteNumber(latest?.totalAssets) && latest.totalAssets !== 0);
  const equityToAssetsPeriod = useTtmEquityToAssets ? latest : latestAnnual;
  const equityToAssets = safeDivide(equityToAssetsPeriod?.totalEquity, equityToAssetsPeriod?.totalAssets);
  const roic = isFiniteNumber(averageCapital) && averageCapital > 0 ? safeDivide(nopat, averageCapital) : null;
  const priorTtmSimpleFcf = deriveSimpleFreeCashFlow(priorTtm);
  const useTtmFcfGrowth = Boolean(useTtmCashFlow && priorTtm && isFiniteNumber(priorTtmSimpleFcf));
  const fcfGrowthLatest = useTtmFcfGrowth ? latest : latestAnnual;
  const fcfGrowthComparison = useTtmFcfGrowth ? priorTtm : previousAnnual;
  const accrualUsesTtm = Boolean(useTtmCashFlow && returnUsesTtm);
  const accrualLatest = accrualUsesTtm ? latest : latestAnnual;
  const accrualComparison = accrualUsesTtm ? ttmReturnComparison : previousAnnual;
  const accrualAverageAssets = average(accrualLatest?.totalAssets, accrualComparison?.totalAssets);
  const accrualRatio = isFiniteNumber(accrualLatest?.netIncome) && isFiniteNumber(accrualLatest?.operatingCashFlow) && isFiniteNumber(accrualAverageAssets)
    ? (accrualLatest.netIncome - accrualLatest.operatingCashFlow) / accrualAverageAssets
    : null;
  const assumedWacc = input.dcfAssumptions?.discountRate;

  const growth = {
    revenueGrowthYoY: calculateGrowth(growthLatest?.revenue, growthComparison?.revenue),
    revenueCagr3y: cagrBetween(threeYearPrior, latestAnnual, threeYearPrior?.revenue, latestAnnual?.revenue),
    revenueCagr5y: cagrBetween(fiveYearPrior, latestAnnual, fiveYearPrior?.revenue, latestAnnual?.revenue),
    epsGrowthYoY: annualEpsYoYComparable ? calculateGrowth(latestAnnual?.epsDiluted, previousAnnual?.epsDiluted) : null,
    epsCagr3y: threeYearShareBasisComparable ? cagrBetween(threeYearPrior, latestAnnual, threeYearPrior?.epsDiluted, latestAnnual?.epsDiluted) : null,
    freeCashFlowGrowthYoY: calculateGrowth(deriveSimpleFreeCashFlow(fcfGrowthLatest), deriveSimpleFreeCashFlow(fcfGrowthComparison)),
    freeCashFlowCagr3y: cagrBetween(threeYearPrior, latestAnnual, deriveSimpleFreeCashFlow(threeYearPrior), deriveSimpleFreeCashFlow(latestAnnual)),
    freeCashFlowPerShareCagr3y: cagrBetween(threeYearPrior, latestAnnual, priorFcfPerShare, latestFcfPerShare),
    revenueGrowthBasis: input.trailingTwelveMonths && priorTtm ? "TTM_YOY" as const : latestAnnual && previousAnnual ? "ANNUAL_YOY" as const : "UNAVAILABLE" as const,
    freeCashFlowGrowthBasis: useTtmFcfGrowth ? "TTM_YOY" as const : latestAnnual && previousAnnual ? "ANNUAL_YOY" as const : "UNAVAILABLE" as const,
  };

  const derivedValuation = blockMarketValuation
    ? unavailableValuationMetrics()
    : deriveValuationMetrics(input, latest, simpleFcf, growth.epsGrowthYoY);
  const reportedValuationFallback = providerReportedValuation(input);
  const valuation = mergeValuationMetrics(derivedValuation, reportedValuationFallback);
  const providerValuationProvenance = (
    metric: keyof ValuationMetrics,
    derivedNote?: string,
    derivedInputs?: string[],
  ): MetricProvenance => {
    if (isFiniteNumber(derivedValuation[metric])) {
      if (metric === "freeCashFlowYield") {
        return derivedProvenance(
          "StockBox deterministic formula",
          cashFlowLatest?.periodEndDate,
          ["marketCap", "simpleFreeCashFlow"],
          useTtmCashFlow ? "Current market cap divided by complete TTM free cash flow." : "Current market cap divided by latest complete annual free cash flow because TTM cash-flow inputs were unavailable.",
        );
      }
      return derivedProvenance("StockBox deterministic formula", latest?.periodEndDate, ["marketCap", String(metric)]);
    }
    if (isFiniteNumber(reportedValuationFallback[metric]) && input.reportedValuation) {
      return {
        source: derivedNote ? "StockBox deterministic formula" : input.reportedValuation.provider,
        periodEnd: input.reportedValuation.asOfDate ?? undefined,
        valueKind: derivedNote ? "derived" : "reported",
        inputs: derivedNote ? derivedInputs : undefined,
        note: derivedNote,
      };
    }
    return derivedProvenance("StockBox deterministic formula", latest?.periodEndDate, [String(metric)]);
  };
  const metrics: FinancialMetrics = {
    latestPeriod: latest,
    previousPeriod: growthComparison,
    margins: {
      grossMargin,
      operatingMargin,
      ebitdaMargin: safeDivide(ebitda, revenue),
      netMargin: safeDivide(netIncome, revenue),
      freeCashFlowMargin: safeDivide(simpleFcf, cashFlowRevenue),
      operatingCashFlowMargin: safeDivide(cashFlowOperatingCashFlow, cashFlowRevenue),
    },
    growth,
    ratios: {
      currentRatio,
      debtToEquity,
      netDebt,
      netDebtToEbitda,
      interestCoverage,
      returnOnEquity: isFiniteNumber(averageEquity) && averageEquity > 0 ? safeDivide(returnNetIncome, averageEquity) : null,
      returnOnAssets: isFiniteNumber(averageAssets) && averageAssets > 0 ? safeDivide(returnNetIncome, averageAssets) : null,
      returnOnInvestedCapital: roic,
      returnOnInvestedCapitalSpread: isFiniteNumber(roic) && isFiniteNumber(assumedWacc) ? roic - assumedWacc : null,
      cashConversion: safeDivide(simpleFcf, cashFlowNetIncome),
      cashToDebt,
      equityToAssets,
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
      cfoToNetIncome: safeDivide(cashFlowOperatingCashFlow, cashFlowNetIncome),
      freeCashFlowToNetIncome: safeDivide(simpleFcf, cashFlowNetIncome),
      accrualRatio,
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
      simpleFreeCashFlow: derivedProvenance("StockBox deterministic formula", cashFlowLatest?.periodEndDate, ["operatingCashFlow", "capitalExpenditures"], useTtmCashFlow ? "TTM CFO - abs(capex)." : "Annual fallback: FY CFO - abs(capex) because complete TTM cash-flow inputs were unavailable."),
      fcff: derivedProvenance("StockBox deterministic formula", cashFlowLatest?.periodEndDate, ["operatingCashFlow", "interestExpense", "normalizedTaxRate", "capitalExpenditures"], useTtmCashFlow ? "TTM FCFF basis." : "Annual fallback because complete TTM cash-flow inputs were unavailable."),
      freeCashFlowMargin: derivedProvenance("StockBox deterministic formula", cashFlowLatest?.periodEndDate, ["simpleFreeCashFlow", "revenue"], useTtmCashFlow ? "TTM cash-flow margin." : "Annual fallback because complete TTM cash-flow inputs were unavailable."),
      operatingCashFlowMargin: derivedProvenance("StockBox deterministic formula", cashFlowLatest?.periodEndDate, ["operatingCashFlow", "revenue"], useTtmCashFlow ? "TTM CFO margin." : "Annual fallback because complete TTM cash-flow inputs were unavailable."),
      cfoToNetIncome: derivedProvenance("StockBox deterministic formula", cashFlowLatest?.periodEndDate, ["operatingCashFlow", "netIncome"], useTtmCashFlow ? "TTM cash conversion." : "Annual fallback because complete TTM cash-flow inputs were unavailable."),
      freeCashFlowToNetIncome: derivedProvenance("StockBox deterministic formula", cashFlowLatest?.periodEndDate, ["simpleFreeCashFlow", "netIncome"], useTtmCashFlow ? "TTM FCF conversion." : "Annual fallback because complete TTM cash-flow inputs were unavailable."),
      marketCap: usesReportedMarketCap
        ? { source: "Market data", provider: input.market?.provider, periodEnd: input.market?.marketCapAsOf ?? input.market?.priceDate ?? undefined, valueKind: "reported" }
        : { ...derivedProvenance("Market data", input.market?.priceDate ?? undefined, ["price", "sharesOutstanding"]), provider: input.market?.provider },
      priceTangibleBook: derivedProvenance("StockBox deterministic formula", latest?.periodEndDate, ["marketCap", "tangibleCommonEquity"]),
      priceEarnings: providerValuationProvenance("priceEarnings"),
      priceSales: providerValuationProvenance("priceSales"),
      priceBook: providerValuationProvenance("priceBook"),
      evSales: providerValuationProvenance("evSales"),
      evEbitda: providerValuationProvenance("evEbitda"),
      peg: providerValuationProvenance("peg"),
      earningsYield: providerValuationProvenance(
        "earningsYield",
        isFiniteNumber(reportedValuationFallback.earningsYield) && !isFiniteNumber(derivedValuation.earningsYield)
          ? "Derived as 1 / provider-reported P/E."
          : undefined,
        ["providerReportedPriceEarnings"],
      ),
      freeCashFlowYield: providerValuationProvenance(
        "freeCashFlowYield",
        isFiniteNumber(reportedValuationFallback.freeCashFlowYield) && !isFiniteNumber(derivedValuation.freeCashFlowYield)
          ? "Derived from same-currency provider-reported free cash flow and market cap."
          : undefined,
        ["providerReportedMarketCap", "providerReportedFreeCashFlow"],
      ),
      netDebtToEbitda: derivedProvenance(
        "StockBox deterministic formula",
        (useTtmLeverage ? latest : latestAnnual)?.periodEndDate,
        ["totalDebt", "cashAndEquivalents", "ebitda"],
        useTtmLeverage ? "TTM leverage ratio from complete same-period inputs." : "Annual fallback because complete same-period TTM leverage inputs were unavailable.",
      ),
      interestCoverage: derivedProvenance(
        "StockBox deterministic formula",
        (useTtmInterestCoverage ? latest : latestAnnual)?.periodEndDate,
        ["operatingIncome", "interestExpense"],
        useTtmInterestCoverage ? "TTM interest coverage from complete same-period inputs." : "Annual fallback because complete same-period TTM interest inputs were unavailable.",
      ),
      cashToDebt: derivedProvenance(
        "StockBox deterministic formula",
        cashToDebtPeriod?.periodEndDate,
        ["cashAndEquivalents", "totalDebt"],
        useTtmCashToDebt ? "Current TTM balance-sheet ratio." : "Annual fallback because complete current TTM balance inputs were unavailable.",
      ),
      currentRatio: derivedProvenance(
        "StockBox deterministic formula",
        currentRatioPeriod?.periodEndDate,
        ["currentAssets", "currentLiabilities"],
        useTtmCurrentRatio ? "Current TTM balance-sheet ratio." : "Annual fallback because complete current TTM balance inputs were unavailable.",
      ),
      returnOnEquity: {
        ...derivedProvenance(
          "StockBox deterministic formula",
          returnLatest?.periodEndDate,
          ["netIncome", "currentEquity", "priorComparableEquity"],
          returnUsesTtm ? "TTM return using prior comparable TTM balance." : "Annual fallback because a comparable prior TTM balance was unavailable.",
        ),
        periodBasis: returnPeriodBasis,
      },
      returnOnAssets: {
        ...derivedProvenance(
          "StockBox deterministic formula",
          returnLatest?.periodEndDate,
          ["netIncome", "currentAssets", "priorComparableAssets"],
          returnUsesTtm ? "TTM return using prior comparable TTM balance." : "Annual fallback because a comparable prior TTM balance was unavailable.",
        ),
        periodBasis: returnPeriodBasis,
      },
      returnOnInvestedCapital: {
        ...derivedProvenance(
          "StockBox deterministic formula",
          returnLatest?.periodEndDate,
          ["operatingIncome", "normalizedTaxRate", "currentInvestedCapital", "priorComparableInvestedCapital"],
          returnUsesTtm ? "TTM return using prior comparable TTM balance." : "Annual fallback because a comparable prior TTM balance was unavailable.",
        ),
        periodBasis: returnPeriodBasis,
      },
      accrualRatio: {
        ...derivedProvenance(
          "StockBox deterministic formula",
          accrualLatest?.periodEndDate,
          ["netIncome", "operatingCashFlow", "currentAssets", "priorComparableAssets"],
          accrualUsesTtm ? "TTM accrual ratio using prior comparable TTM balance." : "Annual fallback because complete comparable TTM cash-flow and balance inputs were unavailable.",
        ),
        periodBasis: accrualUsesTtm ? accrualLatest?.periodBasis : "FY",
      },
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
          fcfGrowthLatest?.periodEndDate,
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
  const marketCapMissingReason = currencyMismatch
    ? "Market cap is not used because financial and market currencies differ; explicit FX conversion is required."
    : currencyUnknown
      ? "Market cap is not used because reporting or trading currency is unknown."
      : marketCapCurrencyMismatch
        ? "Market cap is not used because the reported market cap currency does not align with the verified financial and trading currency."
        : staleMarketCap
          ? "Market cap is not used because the reported market cap is stale or future-dated."
          : staleMarketPrice
            ? "Market cap is not derived because market price data is stale or future-dated."
            : staleShares
              ? "Market cap is not derived because current shares outstanding are stale or future-dated."
              : materialShareBasisMismatch
                ? "Market cap is not used because the listing share basis is not reconciled."
                : "Market cap requires a reported value or both price and shares.";
  addMissingIfNull(missingData, revenue, "revenue", "Revenue is unavailable for the latest reliable period.", "high");
  addMissingIfNull(missingData, simpleFcf, "simpleFreeCashFlow", "CFO and capex are required for simple free cash flow.", "high");
  addMissingIfNull(
    missingData,
    valuation.marketCap,
    "marketCap",
    marketCapMissingReason,
    marketCapMissingReason.startsWith("Market cap requires") ? "medium" : "high",
  );
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
