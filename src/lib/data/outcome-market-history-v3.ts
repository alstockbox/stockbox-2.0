import type { CompanySearchResult, MarketSnapshot } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult } from "./providers";

const PROVIDER_ID = "yahoo-outcome-history-v3";
const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PRICE = 1_000_000_000;

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateFromUnix(value: unknown): string | null {
  const seconds = numeric(value);
  if (seconds === null || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toISOString().slice(0, 10);
  return Date.parse(`${day}T00:00:00.000Z`) <= Date.now() ? day : null;
}

export function yahooOutcomeSymbolV3(company: CompanySearchResult): string {
  const symbol = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  if ((company.country ?? "").trim().toUpperCase() === "US" && symbol.includes(".")) {
    return symbol.replaceAll(".", "-");
  }
  return symbol;
}

export function parseYahooOutcomeHistoryV3(payload: unknown, fallbackTicker: string): MarketSnapshot | null {
  const root = object(payload);
  const chart = object(root?.chart);
  const results = Array.isArray(chart?.result) ? chart.result : [];
  const result = object(results[0]);
  if (!result) return null;

  const meta = object(result.meta);
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = object(result.indicators);
  const quote = Array.isArray(indicators?.quote) ? object(indicators.quote[0]) : null;
  const adjusted = Array.isArray(indicators?.adjclose) ? object(indicators.adjclose[0]) : null;
  const adjustedCloses = Array.isArray(adjusted?.adjclose) ? adjusted.adjclose : null;
  const rawCloses = Array.isArray(quote?.close) ? quote.close : [];
  const closes = adjustedCloses ?? rawCloses;

  const priceHistory = timestamps.flatMap((timestamp, index) => {
    const date = dateFromUnix(timestamp);
    const close = numeric(closes[index]);
    if (!date || close === null || close <= 0 || close > MAX_PRICE) return [];
    return [{ date, close }];
  }).sort((left, right) => left.date.localeCompare(right.date));

  if (priceHistory.length === 0) return null;
  const latest = priceHistory.at(-1)!;
  const currency = text(meta?.currency)?.toUpperCase() ?? null;
  const ticker = text(meta?.symbol)?.toUpperCase() ?? fallbackTicker.trim().toUpperCase();

  return {
    ticker,
    price: latest.close,
    currency,
    date: latest.date,
    volume: null,
    yearHigh: null,
    yearLow: null,
    provider: PROVIDER_ID,
    historyLength: priceHistory.length,
    priceHistory,
    priceHistoryBasis: adjustedCloses ? "adjusted_close" : "close",
    performance: {},
  };
}

export async function fetchOutcomeMarketHistoryV3(
  company: CompanySearchResult,
): Promise<AdapterResult<MarketSnapshot>> {
  const symbol = yahooOutcomeSymbolV3(company);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(`${BASE_URL}/${encodeURIComponent(symbol)}`);
    url.searchParams.set("range", "2y");
    url.searchParams.set("interval", "1d");
    url.searchParams.set("events", "div,splits");
    url.searchParams.set("includeAdjustedClose", "true");

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "StockBox/3.0" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 429) {
      return {
        ok: false,
        reason: "rate_limited",
        message: "Outcome market history provider rate limited the request.",
        diagnostic: providerDiagnostic(PROVIDER_ID, "market_data", "unavailable", "rate_limited"),
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: response.status === 404 ? "not_found" : "upstream_error",
        message: `Outcome market history request failed with HTTP ${response.status}.`,
        diagnostic: providerDiagnostic(PROVIDER_ID, "market_data", "unavailable", `http_${response.status}`),
      };
    }

    const payload = await response.json() as unknown;
    const data = parseYahooOutcomeHistoryV3(payload, symbol);
    if (!data) {
      return {
        ok: false,
        reason: "empty_response",
        message: "Outcome market history contained no usable daily adjusted closes.",
        diagnostic: providerDiagnostic(PROVIDER_ID, "market_data", "unavailable", "empty_response"),
      };
    }

    return {
      ok: true,
      data,
      diagnostic: providerDiagnostic(PROVIDER_ID, "market_data", "available"),
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      reason: timedOut ? "timeout" : "upstream_error",
      message: timedOut ? "Outcome market history request timed out." : "Outcome market history request failed.",
      diagnostic: providerDiagnostic(PROVIDER_ID, "market_data", "unavailable", timedOut ? "timeout" : "upstream_error"),
    };
  } finally {
    clearTimeout(timeout);
  }
}
