import type { AnalysisReport, MarketDividendEvent, MarketPricePoint } from "./types";
import { currencyUnit, economicCurrencyCode } from "./currency-units";

type CurrencyPricePoint = MarketPricePoint & { currency?: string | null; provider?: string };

export type VerifiedMarketHistoryEnrichment = {
  quoteCurrency: string | null;
  priceHistory: CurrencyPricePoint[];
  dividendEvents: MarketDividendEvent[];
  provider: string;
};

export type MarketHistoryEnrichmentResult = {
  applied: boolean;
  reason?: "currency_mismatch" | "currency_unknown" | "no_verified_history";
  priceHistoryExtended: boolean;
  dividendHistoryExtended: boolean;
};

const MAX_MONTHLY_HISTORY_POINTS = 181;
const DAY_MS = 86_400_000;
const YEAR_MS = 365.2425 * DAY_MS;

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function dateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value.includes("T") ? value : `${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function spanYears<T extends { date: string }>(items: T[]): number {
  if (items.length < 2) return 0;
  const first = dateMs(items[0]?.date);
  const last = dateMs(items.at(-1)?.date);
  return first === null || last === null || last <= first ? 0 : (last - first) / YEAR_MS;
}

function quoteScale(currency: string | null | undefined): number | null {
  return currencyUnit(currency)?.quoteToEconomicScale ?? null;
}

function normalizeQuoteValue(value: number, sourceCurrency: string, targetCurrency: string): number | null {
  const sourceScale = quoteScale(sourceCurrency);
  const targetScale = quoteScale(targetCurrency);
  if (sourceScale === null || targetScale === null || targetScale <= 0) return null;
  const normalized = value * sourceScale / targetScale;
  return finitePositive(normalized) ? normalized : null;
}

function normalizePriceHistory(
  points: CurrencyPricePoint[],
  sourceCurrency: string,
  targetCurrency: string,
  provider: string,
): CurrencyPricePoint[] {
  const deduped = new Map<string, CurrencyPricePoint>();
  for (const point of points) {
    const timestamp = dateMs(point.date);
    if (timestamp === null || timestamp > Date.now() || !finitePositive(point.close)) continue;
    const pointCurrency = point.currency ?? sourceCurrency;
    if (economicCurrencyCode(pointCurrency) !== economicCurrencyCode(targetCurrency)) continue;
    const close = normalizeQuoteValue(point.close, pointCurrency, targetCurrency);
    if (close === null) continue;
    deduped.set(point.date.slice(0, 7), {
      date: point.date.slice(0, 10),
      close,
      currency: targetCurrency,
      provider: point.provider ?? provider,
    });
  }
  return [...deduped.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-MAX_MONTHLY_HISTORY_POINTS);
}

function normalizeDividends(
  events: MarketDividendEvent[],
  sourceCurrency: string,
  targetCurrency: string,
  provider: string,
): MarketDividendEvent[] {
  const deduped = new Map<string, MarketDividendEvent>();
  for (const event of events) {
    const timestamp = dateMs(event.date);
    if (timestamp === null || timestamp > Date.now() || !finitePositive(event.amount)) continue;
    const eventCurrency = event.currency ?? sourceCurrency;
    if (economicCurrencyCode(eventCurrency) !== economicCurrencyCode(targetCurrency)) continue;
    const amount = normalizeQuoteValue(event.amount, eventCurrency, targetCurrency);
    if (amount === null) continue;
    deduped.set(`${event.date.slice(0, 10)}:${amount}`, {
      date: event.date.slice(0, 10),
      amount,
      currency: targetCurrency,
      provider: event.provider ?? provider,
    });
  }
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function shiftYears(timestamp: number, years: number): number {
  const date = new Date(timestamp);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.getTime();
}

function trailingDividend(events: MarketDividendEvent[], end: number): { amount: number; count: number } {
  const start = end - YEAR_MS;
  const selected = events.filter((event) => {
    const time = dateMs(event.date);
    return time !== null && time > start && time <= end;
  });
  return {
    amount: selected.reduce((sum, event) => sum + event.amount, 0),
    count: selected.length,
  };
}

function dividendCagr(events: MarketDividendEvent[], anchor: number, years: 3 | 5 | 10): number | null {
  const current = trailingDividend(events, anchor).amount;
  const prior = trailingDividend(events, shiftYears(anchor, years)).amount;
  if (!finitePositive(current) || !finitePositive(prior)) return null;
  const value = Math.pow(current / prior, 1 / years) - 1;
  return Number.isFinite(value) ? value : null;
}

function annualDividendStats(events: MarketDividendEvent[], anchor: number) {
  const currentYear = new Date(anchor).getUTCFullYear();
  const sums = new Map<number, number>();
  for (const event of events) {
    const time = dateMs(event.date);
    if (time === null) continue;
    const year = new Date(time).getUTCFullYear();
    if (year >= currentYear) continue;
    sums.set(year, (sums.get(year) ?? 0) + event.amount);
  }
  const years = [...sums.keys()].sort((a, b) => a - b).slice(-11);
  let increased = 0;
  let unchanged = 0;
  let cut = 0;
  for (let index = 1; index < years.length; index += 1) {
    if (years[index] !== years[index - 1] + 1) continue;
    const prior = sums.get(years[index - 1]) ?? 0;
    const current = sums.get(years[index]) ?? 0;
    if (!finitePositive(prior) || !finitePositive(current)) continue;
    const change = current / prior - 1;
    if (change > 0.005) increased += 1;
    else if (change < -0.005) cut += 1;
    else unchanged += 1;
  }

  let increaseStreak = 0;
  for (let index = years.length - 1; index > 0; index -= 1) {
    if (years[index] !== years[index - 1] + 1) break;
    const prior = sums.get(years[index - 1]) ?? 0;
    const current = sums.get(years[index]) ?? 0;
    if (!finitePositive(prior) || !finitePositive(current) || current / prior - 1 <= 0.005) break;
    increaseStreak += 1;
  }
  return { years: years.length, increased, unchanged, cut, increaseStreak };
}

function paymentFrequency(events: MarketDividendEvent[]): "monthly" | "quarterly" | "semiannual" | "annual" | "irregular" | "none" | "unknown" {
  if (!events.length) return "none";
  if (events.length < 2) return "unknown";
  const gaps = events.slice(1).flatMap((event, index) => {
    const current = dateMs(event.date);
    const previous = dateMs(events[index]?.date);
    return current !== null && previous !== null && current > previous ? [(current - previous) / DAY_MS] : [];
  }).sort((a, b) => a - b);
  if (!gaps.length) return "unknown";
  const middle = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;
  if (median >= 20 && median <= 45) return "monthly";
  if (median >= 60 && median <= 120) return "quarterly";
  if (median >= 130 && median <= 220) return "semiannual";
  if (median >= 280 && median <= 430) return "annual";
  return "irregular";
}

export function applyVerifiedMarketHistoryEnrichment(
  report: AnalysisReport,
  enrichment: VerifiedMarketHistoryEnrichment,
): MarketHistoryEnrichmentResult {
  const targetCurrency = report.market?.currency ?? null;
  const sourceCurrency = enrichment.quoteCurrency;
  const targetEconomic = economicCurrencyCode(targetCurrency);
  const sourceEconomic = economicCurrencyCode(sourceCurrency);
  if (!targetCurrency || !sourceCurrency || !targetEconomic || !sourceEconomic) {
    return { applied: false, reason: "currency_unknown", priceHistoryExtended: false, dividendHistoryExtended: false };
  }
  if (targetEconomic !== sourceEconomic) {
    return { applied: false, reason: "currency_mismatch", priceHistoryExtended: false, dividendHistoryExtended: false };
  }

  const priceHistory = normalizePriceHistory(enrichment.priceHistory, sourceCurrency, targetCurrency, enrichment.provider);
  const dividendEvents = normalizeDividends(enrichment.dividendEvents, sourceCurrency, targetCurrency, enrichment.provider);
  if (!priceHistory.length && !dividendEvents.length) {
    return { applied: false, reason: "no_verified_history", priceHistoryExtended: false, dividendHistoryExtended: false };
  }

  const historical = report.historical;
  const existingPrice = (historical?.price ?? []) as CurrencyPricePoint[];
  const priceHistoryExtended = priceHistory.length >= 2 && spanYears(priceHistory) > spanYears(existingPrice) + 0.25;
  if (priceHistoryExtended && historical) {
    historical.price = priceHistory;
    if (historical.coverage) {
      const years = spanYears(priceHistory);
      historical.coverage.price.availableYears = Math.min(10, years);
      historical.coverage.price.observationCount = priceHistory.length;
      historical.coverage.price.status = years >= 9.5 && priceHistory.length >= 100 ? "full" : "partial";
    }
  }
  if (priceHistoryExtended && report.market) {
    report.market.priceHistory = priceHistory;
    report.market.priceHistoryBasis = "close";
    report.market.historyLength = Math.max(report.market.historyLength ?? 0, priceHistory.length);
  }

  const existingDividendEvents = report.market?.dividendEvents ?? [];
  const dividendHistoryExtended = dividendEvents.length > 0
    && (spanYears(dividendEvents) > spanYears(existingDividendEvents) + 0.25 || existingDividendEvents.length === 0);
  if (dividendHistoryExtended && report.market) report.market.dividendEvents = dividendEvents;

  if (dividendHistoryExtended && historical) {
    const anchor = dateMs(report.market?.date) ?? dateMs(priceHistory.at(-1)?.date) ?? Date.now();
    const trailing = trailingDividend(dividendEvents, anchor);
    const annual = annualDividendStats(dividendEvents, anchor);
    const eventYears = spanYears(dividendEvents);
    const cagr3 = dividendCagr(dividendEvents, anchor, 3);
    const cagr5 = dividendCagr(dividendEvents, anchor, 5);
    const cagr10 = dividendCagr(dividendEvents, anchor, 10);
    historical.dividendCagr3y = cagr3 ?? historical.dividendCagr3y;
    historical.dividendCagr5y = cagr5 ?? historical.dividendCagr5y;
    historical.dividendCagr10y = cagr10 ?? historical.dividendCagr10y;
    historical.dividendYearsIncreased = annual.increased;
    historical.dividendYearsUnchanged = annual.unchanged;
    historical.dividendYearsCut = annual.cut;

    const latest = dividendEvents.at(-1) ?? null;
    const yieldValue = finitePositive(report.market?.price) && trailing.amount > 0 ? trailing.amount / report.market.price : null;
    if (historical.dividendContext) {
      historical.dividendContext.status = trailing.count > 0 ? "available" : "partial";
      historical.dividendContext.trailingDividendsPerShare = trailing.amount > 0 ? trailing.amount : null;
      historical.dividendContext.currentDividendYield = yieldValue;
      historical.dividendContext.paymentCountTtm = trailing.count;
      historical.dividendContext.paymentFrequency = paymentFrequency(dividendEvents);
      historical.dividendContext.latestPaymentDate = latest?.date ?? null;
      historical.dividendContext.latestPaymentAmount = latest?.amount ?? null;
      historical.dividendContext.latestPaymentCurrency = latest?.currency ?? targetCurrency;
      historical.dividendContext.increaseStreakYears = annual.increaseStreak;
      historical.dividendContext.annualHistoryYears = Math.max(historical.dividendContext.annualHistoryYears, annual.years);
      historical.dividendContext.eventCoverageYears = Math.max(historical.dividendContext.eventCoverageYears, eventYears);
    }
    if (historical.coverage) {
      historical.coverage.dividend.availableYears = Math.min(10, Math.max(historical.coverage.dividend.availableYears, eventYears));
      historical.coverage.dividend.observationCount = Math.max(historical.coverage.dividend.observationCount, annual.years);
      historical.coverage.dividend.eventCoverageYears = Math.max(historical.coverage.dividend.eventCoverageYears ?? 0, eventYears);
      historical.coverage.dividend.status = cagr10 !== null && eventYears >= 10 ? "full" : "partial";
    }
  }

  return { applied: priceHistoryExtended || dividendHistoryExtended, priceHistoryExtended, dividendHistoryExtended };
}
