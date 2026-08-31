import type {
  HistoricalTtmEpsPoint,
  HistoricalValuationContext,
  HistoricalValuationPoint,
  HistoricalValuationWindowStats,
  MarketDividendEvent,
  MarketPricePoint,
} from "./types";

export const HISTORICAL_VALUATION_METHOD_VERSION = "historical-valuation-v2";
const MAX_PRICE_LAG_DAYS = 45;
const DAY_MS = 86_400_000;

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: number | null | undefined): value is number {
  return finite(value) && value > 0;
}

function parsedDate(value: string): number | null {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function yearsBetween(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const startMs = parsedDate(start);
  const endMs = parsedDate(end);
  if (startMs === null || endMs === null || endMs < startMs) return 0;
  return (endMs - startMs) / (365.2425 * DAY_MS);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function priceOnOrBefore(date: string, prices: MarketPricePoint[]): MarketPricePoint | null {
  const target = parsedDate(date);
  if (target === null) return null;
  return [...prices]
    .filter((point) => positive(point.close))
    .sort((left, right) => right.date.localeCompare(left.date))
    .find((point) => {
      const time = parsedDate(point.date);
      if (time === null) return false;
      const lagDays = (target - time) / DAY_MS;
      return lagDays >= 0 && lagDays <= MAX_PRICE_LAG_DAYS;
    }) ?? null;
}

export function trailingDividendPerShare(
  date: string,
  dividendEvents: MarketDividendEvent[] | undefined,
): { amount: number | null; paymentCount: number } {
  if (dividendEvents === undefined) return { amount: null, paymentCount: 0 };
  const endMs = parsedDate(date);
  if (endMs === null) return { amount: null, paymentCount: 0 };
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const startMs = start.getTime();
  const payments = dividendEvents.filter((event) => {
    const eventMs = parsedDate(event.date);
    return eventMs !== null && eventMs > startMs && eventMs <= endMs && finite(event.amount) && event.amount > 0;
  });
  return {
    amount: payments.reduce((sum, event) => sum + event.amount, 0),
    paymentCount: payments.length,
  };
}

export function buildHistoricalValuationSeries(input: {
  prices: MarketPricePoint[];
  ttmEps: HistoricalTtmEpsPoint[];
  dividendEvents?: MarketDividendEvent[];
}): HistoricalValuationPoint[] {
  const prices = [...input.prices]
    .filter((point) => positive(point.close) && parsedDate(point.date) !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
  const epsHistory = [...input.ttmEps]
    .filter((point) => parsedDate(point.periodEndDate) !== null && finite(point.epsDiluted))
    .sort((left, right) => left.periodEndDate.localeCompare(right.periodEndDate));

  return epsHistory.map((epsPoint) => {
    const pricePoint = priceOnOrBefore(epsPoint.periodEndDate, prices);
    const ttmDividends = trailingDividendPerShare(epsPoint.periodEndDate, input.dividendEvents);
    const price = pricePoint?.close ?? null;
    const priceEarnings = positive(price) && epsPoint.epsDiluted > 0
      ? price / epsPoint.epsDiluted
      : null;
    const dividendYield = positive(price) && ttmDividends.amount !== null
      ? ttmDividends.amount / price
      : null;
    return {
      date: epsPoint.periodEndDate,
      priceDate: pricePoint?.date ?? null,
      referencePrice: price,
      ttmEps: epsPoint.epsDiluted,
      priceEarnings,
      priceEarningsStatus: epsPoint.epsDiluted <= 0
        ? "not_meaningful"
        : priceEarnings === null ? "unavailable" : "available",
      trailingDividendsPerShare: ttmDividends.amount,
      dividendPaymentCount: ttmDividends.paymentCount,
      dividendYield,
      epsProvenance: epsPoint.provenance,
    } satisfies HistoricalValuationPoint;
  });
}

function windowStart(latestDate: string, years: number): number | null {
  const latest = new Date(`${latestDate}T00:00:00Z`);
  if (Number.isNaN(latest.getTime())) return null;
  latest.setUTCFullYear(latest.getUTCFullYear() - years);
  return latest.getTime();
}

function statsForWindow(
  points: HistoricalValuationPoint[],
  years: 1 | 3 | 5 | 10,
): HistoricalValuationWindowStats {
  const latestDate = points.at(-1)?.date ?? null;
  const startMs = latestDate ? windowStart(latestDate, years) : null;
  const windowPoints = startMs === null
    ? []
    : points.filter((point) => {
      const time = parsedDate(point.date);
      return time !== null && time >= startMs;
    });
  const pe = windowPoints.flatMap((point) => positive(point.priceEarnings) ? [point.priceEarnings] : []);
  const yields = windowPoints.flatMap((point) => finite(point.dividendYield) && point.dividendYield >= 0 ? [point.dividendYield] : []);
  const firstDate = windowPoints.at(0)?.date ?? null;
  const spanYears = yearsBetween(firstDate, latestDate);
  const expectedQuarterlyObservations = years * 4;
  return {
    requestedYears: years,
    firstDate,
    lastDate: latestDate,
    spanYears,
    sufficientHistory: spanYears >= years - 0.5 && windowPoints.length >= Math.ceil(expectedQuarterlyObservations * 0.5),
    observationCount: windowPoints.length,
    peObservationCount: pe.length,
    priceEarningsMedian: median(pe),
    priceEarningsAverage: average(pe),
    dividendYieldObservationCount: yields.length,
    dividendYieldAverage: average(yields),
  };
}

function maxStats(points: HistoricalValuationPoint[]): HistoricalValuationWindowStats {
  const firstDate = points.at(0)?.date ?? null;
  const lastDate = points.at(-1)?.date ?? null;
  const pe = points.flatMap((point) => positive(point.priceEarnings) ? [point.priceEarnings] : []);
  const yields = points.flatMap((point) => finite(point.dividendYield) && point.dividendYield >= 0 ? [point.dividendYield] : []);
  return {
    requestedYears: null,
    firstDate,
    lastDate,
    spanYears: yearsBetween(firstDate, lastDate),
    sufficientHistory: points.length >= 4,
    observationCount: points.length,
    peObservationCount: pe.length,
    priceEarningsMedian: median(pe),
    priceEarningsAverage: average(pe),
    dividendYieldObservationCount: yields.length,
    dividendYieldAverage: average(yields),
  };
}

export function buildHistoricalValuationContext(input: {
  series: HistoricalValuationPoint[];
  currentPriceEarnings?: number | null;
  prices: MarketPricePoint[];
  dividendEvents?: MarketDividendEvent[];
}): HistoricalValuationContext {
  const series = [...input.series].sort((left, right) => left.date.localeCompare(right.date));
  const latestPrice = [...input.prices]
    .filter((point) => positive(point.close) && parsedDate(point.date) !== null)
    .sort((left, right) => left.date.localeCompare(right.date))
    .at(-1) ?? null;
  const currentDividend = latestPrice
    ? trailingDividendPerShare(latestPrice.date, input.dividendEvents)
    : { amount: null, paymentCount: 0 };
  const currentDividendYield = latestPrice && positive(latestPrice.close) && currentDividend.amount !== null
    ? currentDividend.amount / latestPrice.close
    : null;
  const oneYear = statsForWindow(series, 1);
  const threeYear = statsForWindow(series, 3);
  const fiveYear = statsForWindow(series, 5);
  const tenYear = statsForWindow(series, 10);
  const maximum = maxStats(series);
  const comparison = fiveYear.sufficientHistory ? fiveYear : maximum;
  const currentPriceEarnings = positive(input.currentPriceEarnings) ? input.currentPriceEarnings : null;
  const currentPriceEarningsStatus: HistoricalValuationContext["currentPriceEarningsStatus"] = currentPriceEarnings !== null
    ? "available"
    : series.at(-1)?.priceEarningsStatus === "not_meaningful"
      ? "not_meaningful"
      : "unavailable";
  const referenceMedian = positive(comparison.priceEarningsMedian) ? comparison.priceEarningsMedian : null;
  return {
    methodVersion: HISTORICAL_VALUATION_METHOD_VERSION,
    currentPriceEarnings,
    currentPriceEarningsStatus,
    currentDividendYield,
    currentTrailingDividendsPerShare: currentDividend.amount,
    currentDividendPaymentCount: currentDividend.paymentCount,
    currentPeVsReferenceMedian: currentPriceEarnings !== null && referenceMedian !== null
      ? currentPriceEarnings / referenceMedian - 1
      : null,
    referenceWindow: fiveYear.sufficientHistory ? "5Y" : "MAX",
    referencePriceEarningsMedian: referenceMedian,
    availableSince: maximum.firstDate,
    oneYear,
    threeYear,
    fiveYear,
    tenYear,
    maximum,
  };
}
