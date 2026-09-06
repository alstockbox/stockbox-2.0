import type { PaperMarketObservationV3 } from "./engine-v3";
import { PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS } from "./final-performance-v3";

const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const PAPER_FINAL_CUTOFF_QUOTE_TIMEOUT_MS = 8_000;
const MAX_PRICE = 1_000_000_000;

type JsonObject = Record<string, unknown>;

export type YahooFinalCutoffQuoteParseResultV3 = {
  observation: PaperMarketObservationV3;
  reason: string | null;
};

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedTicker(value: string): string | null {
  const ticker = value.trim().toUpperCase();
  return ticker && ticker.length <= 32 ? ticker : null;
}

function normalizedCurrency(value: unknown): string | null {
  const currency = text(value)?.toUpperCase() ?? null;
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function normalizedCutoff(value: string): { iso: string; ms: number } | null {
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : null;
}

function yahooSymbol(ticker: string): string {
  return /^[A-Z]+\.[A-Z]$/.test(ticker) ? ticker.replace(".", "-") : ticker;
}

function unavailable(ticker: string, reason: string): YahooFinalCutoffQuoteParseResultV3 {
  return {
    observation: {
      ticker,
      price: null,
      currency: null,
      observedAt: null,
      provider: "yahoo-chart-final-cutoff",
      verification: "UNAVAILABLE",
    },
    reason,
  };
}

function unverified(input: {
  ticker: string;
  price: number;
  observedAt: string;
  reason: string;
}): YahooFinalCutoffQuoteParseResultV3 {
  return {
    observation: {
      ticker: input.ticker,
      price: input.price,
      currency: null,
      observedAt: input.observedAt,
      provider: "yahoo-chart-final-cutoff",
      verification: "UNVERIFIED",
    },
    reason: input.reason,
  };
}

export function parseYahooFinalCutoffQuoteV3(
  tickerInput: string,
  evaluationCutoffInput: string,
  payload: unknown,
): YahooFinalCutoffQuoteParseResultV3 {
  const ticker = normalizedTicker(tickerInput);
  if (!ticker) return unavailable("UNKNOWN", "invalid_ticker");

  const cutoff = normalizedCutoff(evaluationCutoffInput);
  if (!cutoff) return unavailable(ticker, "invalid_cutoff");

  const root = object(payload);
  const chart = object(root?.chart);
  const providerError = object(chart?.error);
  if (providerError) {
    return unavailable(ticker, text(providerError.description) ?? text(providerError.code) ?? "provider_error");
  }

  const results = Array.isArray(chart?.result) ? chart.result : [];
  const result = object(results[0]);
  const meta = object(result?.meta);
  if (!result || !meta) return unavailable(ticker, "missing_quote_metadata");

  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : null;
  const indicators = object(result.indicators);
  const quotes = Array.isArray(indicators?.quote) ? indicators.quote : [];
  const quote = object(quotes[0]);
  const closes = Array.isArray(quote?.close) ? quote.close : null;
  if (!timestamps || !closes || timestamps.length === 0 || timestamps.length !== closes.length) {
    return unavailable(ticker, "malformed_quote_series");
  }

  let selectedPrice: number | null = null;
  let selectedObservedMs = Number.NEGATIVE_INFINITY;
  const seenTimes = new Set<number>();

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestampSeconds = numberValue(timestamps[index]);
    if (
      timestampSeconds === null
      || !Number.isInteger(timestampSeconds)
      || timestampSeconds <= 0
      || seenTimes.has(timestampSeconds)
    ) {
      return unavailable(ticker, "malformed_quote_series");
    }
    seenTimes.add(timestampSeconds);

    const observedMs = timestampSeconds * 1000;
    if (observedMs > cutoff.ms) continue;
    if (cutoff.ms - observedMs > PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS) continue;

    const price = numberValue(closes[index]);
    if (price === null || price <= 0 || price > MAX_PRICE) continue;

    if (observedMs > selectedObservedMs) {
      selectedObservedMs = observedMs;
      selectedPrice = price;
    }
  }

  if (selectedPrice === null || !Number.isFinite(selectedObservedMs)) {
    return unavailable(ticker, "no_fresh_final_bar");
  }

  const observedAt = new Date(selectedObservedMs).toISOString();
  const currency = normalizedCurrency(meta.currency);
  if (!currency) {
    return unverified({ ticker, price: selectedPrice, observedAt, reason: "invalid_quote_currency" });
  }

  return {
    observation: {
      ticker,
      price: selectedPrice,
      currency,
      observedAt,
      provider: "yahoo-chart-final-cutoff",
      verification: "VERIFIED",
    },
    reason: null,
  };
}

export async function fetchYahooFinalCutoffQuoteV3(
  tickerInput: string,
  evaluationCutoffInput: string,
): Promise<YahooFinalCutoffQuoteParseResultV3> {
  const ticker = normalizedTicker(tickerInput);
  if (!ticker) return unavailable("UNKNOWN", "invalid_ticker");

  const cutoff = normalizedCutoff(evaluationCutoffInput);
  if (!cutoff) return unavailable(ticker, "invalid_cutoff");

  const symbol = yahooSymbol(ticker);
  const url = new URL(`${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(Math.floor((cutoff.ms - PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS) / 1000)));
  url.searchParams.set("period2", String(Math.floor(cutoff.ms / 1000) + 60));
  url.searchParams.set("interval", "1m");
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAPER_FINAL_CUTOFF_QUOTE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok) {
      return unavailable(ticker, response.status === 429 ? "rate_limited" : `http_${response.status}`);
    }
    if (!contentType.includes("json")) return unavailable(ticker, "unexpected_content_type");
    const providerPayload = await response.json();
    return parseYahooFinalCutoffQuoteV3(ticker, cutoff.iso, providerPayload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return unavailable(ticker, "timeout");
    return unavailable(ticker, "upstream_error");
  } finally {
    clearTimeout(timeout);
  }
}
