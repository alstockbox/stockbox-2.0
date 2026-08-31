import type {
  FinancialPeriod,
  HistoricalFinancialPoint,
  HistoricalPriceContext,
  HistoricalPriceWindowStats,
  HistoricalResearchData,
  HistoricalTtmEpsPoint,
  MarketDividendEvent,
  MarketPricePoint,
} from "./types";
import { calculateCagr, calculateGrowth, isFiniteNumber, safeDivide } from "./math";
import { deriveSimpleFreeCashFlow, shareBasisComparable, sortFinancialPeriods } from "./metrics";
import {
  buildHistoricalValuationContext,
  buildHistoricalValuationSeries,
  HISTORICAL_VALUATION_METHOD_VERSION,
} from "./historical-valuation";

const MAX_REFERENCE_PRICE_LAG_DAYS = 45;
const MAX_PRICE_POINTS = 121;

function positive(value: number | null | undefined): number | null {
  return isFiniteNumber(value) && value > 0 ? value : null;
}

function fiscalYear(period: FinancialPeriod): number | null {
  if (Number.isInteger(period.fiscalYear)) return period.fiscalYear as number;
  const parsed = Number(period.periodEndDate?.slice(0, 4));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function average(left: number | null | undefined, right: number | null | undefined): number | null {
  return isFiniteNumber(left) && isFiniteNumber(right) ? (left + right) / 2 : null;
}

function periodShares(period: FinancialPeriod): number | null {
  return positive(period.sharesDiluted) ?? positive(period.currentSharesOutstanding);
}
function dividendsPaid(period: FinancialPeriod): number | null {
  return isFiniteNumber(period.dividendsPaid) ? Math.abs(period.dividendsPaid) : null;
}

function referencePrice(period: FinancialPeriod, prices: MarketPricePoint[]): number | null {
  if (!period.periodEndDate) return null;
  const target = Date.parse(`${period.periodEndDate}T23:59:59Z`);
  if (!Number.isFinite(target)) return null;
  const candidate = [...prices].reverse().find((point) => {
    if (!positive(point.close)) return false;
    const time = Date.parse(`${point.date}T00:00:00Z`);
    const lagDays = (target - time) / 86_400_000;
    return Number.isFinite(time) && lagDays >= 0 && lagDays <= MAX_REFERENCE_PRICE_LAG_DAYS;
  });
  return candidate?.close ?? null;
}

function normalizedTaxRate(period: FinancialPeriod): number | null {
  const pretaxIncome = positive(period.pretaxIncome);
  if (pretaxIncome === null || !isFiniteNumber(period.incomeTaxExpense)) return null;
  const rate = period.incomeTaxExpense / pretaxIncome;
  return rate >= 0 && rate <= 0.6 ? rate : null;
}

function investedCapital(period: FinancialPeriod): number | null {
  if (!isFiniteNumber(period.totalDebt) || !isFiniteNumber(period.totalEquity)) return null;
  const cash = isFiniteNumber(period.cashAndEquivalents) ? period.cashAndEquivalents : 0;
  const value = period.totalDebt + period.totalEquity - cash;
  return value > 0 ? value : null;
}
function returnOnInvestedCapital(period: FinancialPeriod, prior: FinancialPeriod | undefined): number | null {
  if (!isFiniteNumber(period.operatingIncome)) return null;
  const taxRate = normalizedTaxRate(period);
  const currentCapital = investedCapital(period);
  const priorCapital = prior ? investedCapital(prior) : null;
  if (taxRate === null || currentCapital === null || priorCapital === null) return null;
  const averageCapital = (currentCapital + priorCapital) / 2;
  if (averageCapital <= 0) return null;
  return period.operatingIncome * (1 - taxRate) / averageCapital;
}

function ratioWithPositiveDenominator(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  return positive(denominator) === null ? null : safeDivide(numerator, denominator);
}

function pointForPeriod(
  period: FinancialPeriod,
  prior: FinancialPeriod | undefined,
  prices: MarketPricePoint[],
): HistoricalFinancialPoint | null {
  const year = fiscalYear(period);
  if (year === null) return null;
  const shares = periodShares(period);
  const priorShares = prior ? periodShares(prior) : null;
  const shareCount = positive(shares);
  const priorShareCount = positive(priorShares);
  const fcf = deriveSimpleFreeCashFlow(period);
  const positiveFcf = positive(fcf);
  const dividends = dividendsPaid(period);
  const price = referencePrice(period, prices);
  const positiveNetIncome = positive(period.netIncome);
  const dividendPerShare = shareCount !== null && isFiniteNumber(dividends) ? dividends / shareCount : null;
  const priorDividends = prior ? dividendsPaid(prior) : null;
  const priorDividendPerShare = prior && priorShareCount !== null && isFiniteNumber(priorDividends)
    ? priorDividends / priorShareCount
    : null;
  const averageEquity = prior ? average(period.totalEquity, prior.totalEquity) : null;
  const averageAssets = prior ? average(period.totalAssets, prior.totalAssets) : null;
  const interestCoverage = isFiniteNumber(period.operatingIncome)
    && isFiniteNumber(period.interestExpense)
    && Math.abs(period.interestExpense) > 0
    ? period.operatingIncome / Math.abs(period.interestExpense)
    : null;
  const netDebt = isFiniteNumber(period.totalDebt) && isFiniteNumber(period.cashAndEquivalents)
    ? period.totalDebt - period.cashAndEquivalents
    : null;
  return {
    fiscalYear: year,
    periodEndDate: period.periodEndDate ?? null,
    currency: period.currency ?? null,
    revenue: period.revenue ?? null,
    revenueGrowth: prior ? calculateGrowth(period.revenue, prior.revenue) : null,
    eps: period.epsDiluted ?? null,
    epsGrowth: prior && shareBasisComparable(period, prior)
      ? calculateGrowth(period.epsDiluted, prior.epsDiluted)
      : null,
    netIncome: period.netIncome ?? null,
    freeCashFlow: fcf,
    freeCashFlowPerShare: shareCount !== null && isFiniteNumber(fcf) ? fcf / shareCount : null,
    freeCashFlowMargin: safeDivide(fcf, period.revenue),
    grossMargin: safeDivide(period.grossProfit, period.revenue),
    operatingMargin: safeDivide(period.operatingIncome, period.revenue),
    netMargin: safeDivide(period.netIncome, period.revenue),
    returnOnEquity: positive(averageEquity) ? safeDivide(period.netIncome, averageEquity) : null,
    returnOnAssets: positive(averageAssets) ? safeDivide(period.netIncome, averageAssets) : null,
    returnOnInvestedCapital: returnOnInvestedCapital(period, prior),
    cash: period.cashAndEquivalents ?? null,
    totalDebt: period.totalDebt ?? null,
    netDebt,
    debtToEquity: ratioWithPositiveDenominator(period.totalDebt, period.totalEquity),
    currentRatio: ratioWithPositiveDenominator(period.currentAssets, period.currentLiabilities),
    interestCoverage,
    sharesOutstanding: shares,
    shareGrowth: prior && shareBasisComparable(period, prior)
      ? calculateGrowth(shares, priorShares)
      : null,
    dividendsPaid: dividends,
    dividendPerShare,
    dividendGrowth: calculateGrowth(dividendPerShare, priorDividendPerShare),
    payoutRatio: positiveNetIncome !== null && isFiniteNumber(dividends)
      ? dividends / positiveNetIncome
      : null,
    freeCashFlowPayoutRatio: positiveFcf !== null && isFiniteNumber(dividends) ? dividends / positiveFcf : null,
    referencePrice: price,
    // Historical valuation is intentionally not derived from annual EPS or annualized cash dividends.
    // Correct TTM valuation lives in HistoricalResearchData.valuation.
    priceEarnings: null,
    dividendYield: null,
    provenance: period.provenance,
  };
}

function cagrForYears(
  points: HistoricalFinancialPoint[],
  years: number,
  selector: (point: HistoricalFinancialPoint) => number | null,
): number | null {
  const latest = points.at(-1);
  if (!latest) return null;
  const prior = points.find((point) => point.fiscalYear === latest.fiscalYear - years);
  if (!prior) return null;
  return calculateCagr(selector(prior), selector(latest), years);
}

function growthForYears(
  points: HistoricalFinancialPoint[],
  years: number,
  selector: (point: HistoricalFinancialPoint) => number | null,
): number | null {
  const latest = points.at(-1);
  if (!latest) return null;
  const prior = points.find((point) => point.fiscalYear === latest.fiscalYear - years);
  if (!prior) return null;
  return calculateGrowth(selector(latest), selector(prior));
}

function parsedPriceDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value.includes("T") ? value : value + "T00:00:00Z");
  return Number.isFinite(time) ? time : null;
}

function priceSpanYears(firstDate: string | null, lastDate: string | null): number {
  const first = parsedPriceDate(firstDate);
  const last = parsedPriceDate(lastDate);
  if (first === null || last === null || last < first) return 0;
  return (last - first) / (365.2425 * 86_400_000);
}

function historicalPriceWindow(
  prices: MarketPricePoint[],
  currentPrice: number | null,
  endDate: string | null,
  years: 1 | 3 | 5 | 10 | null,
): HistoricalPriceWindowStats {
  const endMs = parsedPriceDate(endDate) ?? parsedPriceDate(prices.at(-1)?.date);
  const startMs = endMs !== null && years !== null
    ? (() => {
        const date = new Date(endMs);
        date.setUTCFullYear(date.getUTCFullYear() - years);
        return date.getTime();
      })()
    : null;
  const selected = prices.filter((point) => {
    const time = parsedPriceDate(point.date);
    if (time === null || !isFiniteNumber(point.close) || point.close <= 0) return false;
    if (endMs !== null && time > endMs) return false;
    return startMs === null || time >= startMs;
  });
  const values = selected.map((point) => point.close);
  const firstDate = selected.at(0)?.date ?? null;
  const lastDate = selected.at(-1)?.date ?? null;
  const spanYears = priceSpanYears(firstDate, lastDate);
  const minimumObservations = years === null ? 2 : Math.max(3, years * 2);
  const sufficientHistory = years === null
    ? selected.length >= minimumObservations
    : spanYears >= years - 0.1 && selected.length >= minimumObservations;
  const low = values.length ? Math.min(...values) : null;
  const high = values.length ? Math.max(...values) : null;
  return {
    requestedYears: years,
    firstDate,
    lastDate,
    spanYears,
    sufficientHistory,
    observationCount: selected.length,
    low,
    high,
    currentVsLow: currentPrice !== null && low !== null ? currentPrice / low - 1 : null,
    currentVsHigh: currentPrice !== null && high !== null ? currentPrice / high - 1 : null,
  };
}

function buildHistoricalPriceContext(
  prices: MarketPricePoint[],
  options: HistoricalResearchOptions,
): HistoricalPriceContext {
  const latestPrice = prices.at(-1) ?? null;
  const currentPrice = positive(options.currentPrice) ?? positive(latestPrice?.close);
  const currentPriceDate = parsedPriceDate(options.currentPriceDate) !== null
    ? options.currentPriceDate ?? null
    : latestPrice?.date ?? null;
  const oneYear = historicalPriceWindow(prices, currentPrice, currentPriceDate, 1);
  const threeYear = historicalPriceWindow(prices, currentPrice, currentPriceDate, 3);
  const fiveYear = historicalPriceWindow(prices, currentPrice, currentPriceDate, 5);
  const tenYear = historicalPriceWindow(prices, currentPrice, currentPriceDate, 10);
  const maximum = historicalPriceWindow(prices, currentPrice, currentPriceDate, null);
  const providerHigh = positive(options.yearHigh);
  const providerLow = positive(options.yearLow);
  const useProviderRange = providerHigh !== null && providerLow !== null && providerHigh >= providerLow;
  const useHistoryRange = !useProviderRange && oneYear.sufficientHistory && oneYear.high !== null && oneYear.low !== null;
  const yearHigh = useProviderRange ? providerHigh : useHistoryRange ? oneYear.high : null;
  const yearLow = useProviderRange ? providerLow : useHistoryRange ? oneYear.low : null;
  return {
    currentPrice,
    currentPriceDate,
    yearHigh,
    yearLow,
    distanceToYearHigh: currentPrice !== null && yearHigh !== null ? currentPrice / yearHigh - 1 : null,
    distanceFromYearLow: currentPrice !== null && yearLow !== null ? currentPrice / yearLow - 1 : null,
    yearRangeSource: useProviderRange ? "provider" : useHistoryRange ? "price_history" : null,
    oneYear,
    threeYear,
    fiveYear,
    tenYear,
    maximum,
  };
}

function dividendStreakStats(points: HistoricalFinancialPoint[]) {
  let increased = 0;
  let unchanged = 0;
  let cut = 0;
  for (let index = 1; index < points.length; index += 1) {
    const prior = positive(points[index - 1]?.dividendPerShare);
    const current = positive(points[index]?.dividendPerShare);
    if (prior === null || current === null) continue;
    const change = current / prior - 1;
    if (change > 0.005) increased += 1;
    else if (change < -0.005) cut += 1;
    else unchanged += 1;
  }
  return { increased, unchanged, cut };
}

export type HistoricalResearchOptions = {
  ttmEpsHistory?: HistoricalTtmEpsPoint[];
  dividendEvents?: MarketDividendEvent[];
  currentPriceEarnings?: number | null;
  currentPrice?: number | null;
  currentPriceDate?: string | null;
  yearHigh?: number | null;
  yearLow?: number | null;
};

export function buildHistoricalResearchData(
  annualPeriods: FinancialPeriod[],
  priceHistory: MarketPricePoint[] = [],
  options: HistoricalResearchOptions = {},
): HistoricalResearchData {
  const sortedPeriods = sortFinancialPeriods(annualPeriods)
    .filter((period) => fiscalYear(period) !== null)
    .slice(-11);
  const sortedPrices = [...priceHistory]
    .filter((point) => positive(point.close) !== null && Number.isFinite(Date.parse(point.date)))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-MAX_PRICE_POINTS);
  const points = sortedPeriods.flatMap((period, index) => {
    const point = pointForPeriod(period, sortedPeriods[index - 1], sortedPrices);
    return point ? [point] : [];
  });
  const dividendStats = dividendStreakStats(points);
  const priceContext = buildHistoricalPriceContext(sortedPrices, options);
  const valuation = buildHistoricalValuationSeries({
    prices: sortedPrices,
    ttmEps: options.ttmEpsHistory ?? [],
    dividendEvents: options.dividendEvents,
  });
  const valuationContext = buildHistoricalValuationContext({
    series: valuation,
    currentPriceEarnings: options.currentPriceEarnings,
    prices: sortedPrices,
    dividendEvents: options.dividendEvents,
  });

  return {
    financials: points.slice(-10),
    price: sortedPrices,
    priceContext,
    valuation,
    valuationContext,
    valuationMethodVersion: HISTORICAL_VALUATION_METHOD_VERSION,
    revenueCagr3y: cagrForYears(points, 3, (point) => point.revenue),
    revenueCagr5y: cagrForYears(points, 5, (point) => point.revenue),
    revenueCagr10y: cagrForYears(points, 10, (point) => point.revenue),
    epsCagr3y: cagrForYears(points, 3, (point) => point.eps),
    epsCagr5y: cagrForYears(points, 5, (point) => point.eps),
    epsCagr10y: cagrForYears(points, 10, (point) => point.eps),
    freeCashFlowGrowth1y: growthForYears(points, 1, (point) => point.freeCashFlow),
    freeCashFlowCagr3y: cagrForYears(points, 3, (point) => point.freeCashFlow),
    freeCashFlowCagr5y: cagrForYears(points, 5, (point) => point.freeCashFlow),
    freeCashFlowCagr10y: cagrForYears(points, 10, (point) => point.freeCashFlow),
    dividendCagr3y: cagrForYears(points, 3, (point) => point.dividendPerShare),
    dividendCagr5y: cagrForYears(points, 5, (point) => point.dividendPerShare),
    dividendCagr10y: cagrForYears(points, 10, (point) => point.dividendPerShare),
    dividendYearsIncreased: dividendStats.increased,
    dividendYearsUnchanged: dividendStats.unchanged,
    dividendYearsCut: dividendStats.cut,
  };
}
