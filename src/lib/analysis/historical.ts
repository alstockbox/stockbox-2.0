import type {
  FinancialPeriod,
  HistoricalFinancialPoint,
  HistoricalResearchData,
  MarketPricePoint,
} from "./types";
import { calculateCagr, calculateGrowth, isFiniteNumber, safeDivide } from "./math";
import { deriveSimpleFreeCashFlow, shareBasisComparable, sortFinancialPeriods } from "./metrics";

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
  const positivePrice = positive(price);
  const positiveEps = positive(period.epsDiluted);
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
  const priceEarnings = positivePrice !== null && positiveEps !== null
    ? positivePrice / positiveEps
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
    priceEarnings,
    dividendYield: positivePrice !== null && isFiniteNumber(dividendPerShare)
      ? dividendPerShare / positivePrice
      : null,
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

export function buildHistoricalResearchData(
  annualPeriods: FinancialPeriod[],
  priceHistory: MarketPricePoint[] = [],
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

  return {
    financials: points.slice(-10),
    price: sortedPrices,
    revenueCagr3y: cagrForYears(points, 3, (point) => point.revenue),
    revenueCagr5y: cagrForYears(points, 5, (point) => point.revenue),
    revenueCagr10y: cagrForYears(points, 10, (point) => point.revenue),
    epsCagr3y: cagrForYears(points, 3, (point) => point.eps),
    epsCagr5y: cagrForYears(points, 5, (point) => point.eps),
    epsCagr10y: cagrForYears(points, 10, (point) => point.eps),
    dividendCagr3y: cagrForYears(points, 3, (point) => point.dividendPerShare),
    dividendCagr5y: cagrForYears(points, 5, (point) => point.dividendPerShare),
    dividendCagr10y: cagrForYears(points, 10, (point) => point.dividendPerShare),
    dividendYearsIncreased: dividendStats.increased,
    dividendYearsUnchanged: dividendStats.unchanged,
    dividendYearsCut: dividendStats.cut,
  };
}
