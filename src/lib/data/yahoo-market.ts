import type {
  CompanySearchResult,
  MarketDividendEvent,
  MarketSplitEvent,
} from "@/lib/analysis/types";
import {
  YAHOO_MARKET_CAPABILITIES,
  yahooMarketDataProvider as coreYahooMarketDataProvider,
} from "./yahoo-market-core";

export { YAHOO_MARKET_CAPABILITIES };

const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const PROVIDER_ID = "yahoo-chart";
const REQUEST_TIMEOUT_MS = 10_000;
const CORPORATE_ACTIONS_REVALIDATE_SECONDS = 60 * 60 * 6;

type JsonObject = Record<string, unknown>;

type CorporateActions = {
  dividendEvents: MarketDividendEvent[];
  splitEvents: MarketSplitEvent[];
};

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateFromUnix(timestamp: number): string | null {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function yahooSymbol(company: CompanySearchResult): string {
  const symbol = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  if ((company.country ?? "").toUpperCase() === "US" && symbol.includes(".")) {
    return symbol.replaceAll(".", "-");
  }
  return symbol;
}

function firstChartResult(payload: JsonObject): JsonObject | null {
  const chart = object(payload.chart);
  const results = Array.isArray(chart?.result) ? chart.result : [];
  return object(results[0]);
}

function parseDividendEvents(result: JsonObject, currency: string | null): MarketDividendEvent[] {
  const events = object(result.events);
  const dividends = object(events?.dividends);
  if (!dividends) return [];

  const deduped = new Map<string, MarketDividendEvent>();
  for (const eventValue of Object.values(dividends)) {
    const event = object(eventValue);
    const amount = numberValue(event?.amount);
    const date = dateFromUnix(numberValue(event?.date) ?? Number.NaN);
    if (!date || amount === null || amount <= 0) continue;
    if (Date.parse(`${date}T00:00:00Z`) > Date.now()) continue;
    deduped.set(`${date}:${amount}`, {
      date,
      amount,
      currency,
      provider: PROVIDER_ID,
    });
  }
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function parseSplitEvents(result: JsonObject): MarketSplitEvent[] {
  const events = object(result.events);
  const splits = object(events?.splits);
  if (!splits) return [];

  return Object.values(splits).flatMap((eventValue) => {
    const event = object(eventValue);
    const date = dateFromUnix(numberValue(event?.date) ?? Number.NaN);
    if (!date || Date.parse(`${date}T00:00:00Z`) > Date.now()) return [];

    const numerator = numberValue(event?.numerator);
    const denominator = numberValue(event?.denominator);
    const ratioFromNumbers = numerator !== null && denominator !== null
      && numerator > 0 && denominator > 0
      ? numerator / denominator
      : null;
    const ratioText = stringValue(event?.splitRatio);
    const ratioParts = ratioText?.split(":").map(Number) ?? [];
    const ratioFromText = ratioParts.length === 2
      && Number.isFinite(ratioParts[0])
      && Number.isFinite(ratioParts[1])
      && ratioParts[1] > 0
      ? ratioParts[0] / ratioParts[1]
      : null;

    return [{
      date,
      numerator,
      denominator,
      splitRatio: ratioFromNumbers ?? ratioFromText,
      provider: PROVIDER_ID,
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

async function fetchMaximumCorporateActions(
  company: CompanySearchResult,
  currency: string | null,
): Promise<CorporateActions | null> {
  const url = new URL(`${BASE_URL}/${encodeURIComponent(yahooSymbol(company))}`);
  url.searchParams.set("range", "max");
  url.searchParams.set("interval", "1mo");
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: CORPORATE_ACTIONS_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("json")) return null;
    const payload = object(await response.json());
    if (!payload) return null;
    const result = firstChartResult(payload);
    if (!result) return null;
    return {
      dividendEvents: parseDividendEvents(result, currency),
      splitEvents: parseSplitEvents(result),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeDividendEvents(
  baseEvents: MarketDividendEvent[] = [],
  extendedEvents: MarketDividendEvent[] = [],
): MarketDividendEvent[] {
  const deduped = new Map<string, MarketDividendEvent>();
  for (const event of [...baseEvents, ...extendedEvents]) {
    deduped.set(`${event.date}:${event.amount}`, event);
  }
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function mergeSplitEvents(
  baseEvents: MarketSplitEvent[] = [],
  extendedEvents: MarketSplitEvent[] = [],
): MarketSplitEvent[] {
  const deduped = new Map<string, MarketSplitEvent>();
  for (const event of [...baseEvents, ...extendedEvents]) {
    deduped.set(
      `${event.date}:${event.numerator ?? ""}:${event.denominator ?? ""}:${event.splitRatio ?? ""}`,
      event,
    );
  }
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export const yahooMarketDataProvider: typeof coreYahooMarketDataProvider = {
  ...coreYahooMarketDataProvider,
  async fetchMarketData(company) {
    const baseResult = await coreYahooMarketDataProvider.fetchMarketData(company);
    if (!baseResult.ok) return baseResult;

    const maximumActions = await fetchMaximumCorporateActions(
      company,
      baseResult.data.currency,
    );
    if (!maximumActions) return baseResult;

    return {
      ...baseResult,
      data: {
        ...baseResult.data,
        dividendEvents: mergeDividendEvents(
          baseResult.data.dividendEvents,
          maximumActions.dividendEvents,
        ),
        splitEvents: mergeSplitEvents(
          baseResult.data.splitEvents,
          maximumActions.splitEvents,
        ),
      },
    };
  },
};
