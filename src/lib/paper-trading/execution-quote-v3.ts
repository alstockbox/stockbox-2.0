import type { PaperMarketObservationV3 } from "./engine-v3";

const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const PAPER_EXECUTION_QUOTE_TIMEOUT_MS = 8_000;
const MAX_PRICE = 1_000_000_000;

type JsonObject = Record<string, unknown>;

type YahooExecutionQuoteParseResultV3 = {
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

function yahooSymbol(ticker: string): string {
  // Yahoo represents US share classes with a dash. Exchange-qualified global
  // tickers already use provider suffixes and must be preserved.
  return /^[A-Z]+\.[A-Z]$/.test(ticker) ? ticker.replace(".", "-") : ticker;
}

function unavailable(ticker: string, reason: string): YahooExecutionQuoteParseResultV3 {
  return {
    observation: {
      ticker,
      price: null,
      currency: null,
      observedAt: null,
      provider: "yahoo-chart-execution",
      verification: "UNAVAILABLE",
    },
    reason,
  };
}

function unverified(input: {
  ticker: string;
  price: number | null;
  currency: string | null;
  observedAt: string | null;
  reason: string;
}): YahooExecutionQuoteParseResultV3 {
  return {
    observation: {
      ticker: input.ticker,
      price: input.price,
      currency: input.currency,
      observedAt: input.observedAt,
      provider: "yahoo-chart-execution",
      verification: "UNVERIFIED",
    },
    reason: input.reason,
  };
}

export function parseYahooExecutionQuoteV3(
  tickerInput: string,
  payload: unknown,
): YahooExecutionQuoteParseResultV3 {
  const ticker = normalizedTicker(tickerInput);
  if (!ticker) return unavailable("UNKNOWN", "invalid_ticker");

  const root = object(payload);
  const chart = object(root?.chart);
  const error = object(chart?.error);
  if (error) return unavailable(ticker, text(error.description) ?? text(error.code) ?? "provider_error");

  const results = Array.isArray(chart?.result) ? chart.result : [];
  const result = object(results[0]);
  const meta = object(result?.meta);
  if (!meta) return unavailable(ticker, "missing_quote_metadata");

  const price = numberValue(meta.regularMarketPrice);
  const currency = normalizedCurrency(meta.currency);
  const marketTimeSeconds = numberValue(meta.regularMarketTime);
  const observedAt = marketTimeSeconds !== null && marketTimeSeconds > 0
    ? new Date(marketTimeSeconds * 1000).toISOString()
    : null;

  if (price === null || price <= 0 || price > MAX_PRICE) {
    return unverified({ ticker, price: null, currency, observedAt, reason: "invalid_regular_market_price" });
  }
  if (!currency) {
    return unverified({ ticker, price, currency: null, observedAt, reason: "invalid_quote_currency" });
  }
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) {
    return unverified({ ticker, price, currency, observedAt: null, reason: "missing_regular_market_time" });
  }

  return {
    observation: {
      ticker,
      price,
      currency,
      observedAt,
      provider: "yahoo-chart-execution",
      verification: "VERIFIED",
    },
    reason: null,
  };
}

export async function fetchYahooExecutionQuoteV3(tickerInput: string): Promise<YahooExecutionQuoteParseResultV3> {
  const ticker = normalizedTicker(tickerInput);
  if (!ticker) return unavailable("UNKNOWN", "invalid_ticker");

  const symbol = yahooSymbol(ticker);
  const url = new URL(`${YAHOO_CHART_BASE_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "1m");
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAPER_EXECUTION_QUOTE_TIMEOUT_MS);
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
    const payload = await response.json();
    return parseYahooExecutionQuoteV3(ticker, payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return unavailable(ticker, "timeout");
    return unavailable(ticker, "upstream_error");
  } finally {
    clearTimeout(timeout);
  }
}
