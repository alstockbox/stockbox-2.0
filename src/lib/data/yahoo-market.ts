import type { CompanySearchResult, MarketSnapshot } from "@/lib/analysis/types";
import {
  providerDiagnostic,
  type AdapterResult,
  type MarketDataProvider,
  type ProviderCapabilities,
  type ProviderFailureReason,
} from "./providers";

const PROVIDER_ID = "yahoo-chart";
const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const MAX_PRICE = 1_000_000_000;
const TARGET_TOLERANCE_DAYS = 7;

export const YAHOO_MARKET_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["global"],
  supportedExchanges: ["Yahoo Finance chart catalog"],
  supportsFundamentals: false,
  supportsMarketData: true,
  supportsEstimates: false,
};

type JsonObject = Record<string, unknown>;
type PriceRow = { date: string; close: number; volume: number | null };

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function failure<T>(reason: ProviderFailureReason, message: string): AdapterResult<T> {
  return {
    ok: false,
    reason,
    message,
    diagnostic: providerDiagnostic("Yahoo Finance chart", "market_data", "unavailable", reason),
  };
}

function toYahooSymbol(company: CompanySearchResult): string {
  const symbol = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  if ((company.country ?? "").toUpperCase() === "US" && symbol.includes(".")) return symbol.replaceAll(".", "-");
  if (/\.[A-Z]{1,5}$/.test(symbol)) return symbol;
  return symbol;
}

function dateFromUnix(timestamp: number): string | null {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseRows(result: JsonObject): PriceRow[] {
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = object(result.indicators);
  const quote = Array.isArray(indicators?.quote) ? object(indicators.quote[0]) : null;
  const adjusted = Array.isArray(indicators?.adjclose) ? object(indicators.adjclose[0]) : null;
  const closes = Array.isArray(adjusted?.adjclose)
    ? adjusted.adjclose
    : Array.isArray(quote?.close) ? quote.close : [];
  const volumes = Array.isArray(quote?.volume) ? quote.volume : [];

  return timestamps.flatMap((timestamp, index) => {
    const date = dateFromUnix(numberValue(timestamp) ?? Number.NaN);
    const close = numberValue(closes[index]);
    const volume = numberValue(volumes[index]);
    if (!date || !close || close <= 0 || close > MAX_PRICE) return [];
    if (Date.parse(`${date}T00:00:00Z`) > Date.now()) return [];
    return [{ date, close, volume }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function shiftUtcDate(date: string, months: number, years: number): Date {
  const target = new Date(`${date}T00:00:00Z`);
  if (years) target.setUTCFullYear(target.getUTCFullYear() - years);
  if (months) target.setUTCMonth(target.getUTCMonth() - months);
  return target;
}

function returnNearTarget(rows: PriceRow[], target: Date): number | null {
  const current = rows.at(-1);
  if (!current) return null;
  const targetMs = target.getTime();
  const prior = [...rows].reverse().find((row) => {
    const rowMs = Date.parse(`${row.date}T00:00:00Z`);
    const distanceDays = (targetMs - rowMs) / 86_400_000;
    return distanceDays >= 0 && distanceDays <= TARGET_TOLERANCE_DAYS;
  });
  return prior && prior.close > 0 ? current.close / prior.close - 1 : null;
}

function shortReturn(rows: PriceRow[], tradingDays: number): number | null {
  const current = rows.at(-1);
  const prior = rows.at(-1 - tradingDays);
  return current && prior && prior.close > 0 ? current.close / prior.close - 1 : null;
}

function yearToDate(rows: PriceRow[]): number | null {
  const current = rows.at(-1);
  if (!current) return null;
  const year = current.date.slice(0, 4);
  const start = rows.find((row) => row.date.startsWith(year));
  return start && start.close > 0 ? current.close / start.close - 1 : null;
}

function lastYearRows(rows: PriceRow[]): PriceRow[] {
  const current = rows.at(-1);
  if (!current) return [];
  const cutoff = new Date(`${current.date}T00:00:00Z`);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return rows.filter((row) => Date.parse(`${row.date}T00:00:00Z`) >= cutoff.getTime());
}
function metaNumber(meta: JsonObject, key: string): number | null {
  const value = numberValue(meta[key]);
  return value !== null && value >= 0 ? value : null;
}

function unixDate(value: unknown): string | null {
  const timestamp = numberValue(value);
  return timestamp === null ? null : dateFromUnix(timestamp);
}

function yahooError(payload: JsonObject): string | null {
  const chart = object(payload.chart);
  const error = object(chart?.error);
  return stringValue(error?.description) ?? stringValue(error?.code);
}

function firstChartResult(payload: JsonObject): JsonObject | null {
  const chart = object(payload.chart);
  const results = Array.isArray(chart?.result) ? chart.result : [];
  return object(results[0]);
}
async function requestChart(symbol: string): Promise<AdapterResult<JsonObject>> {
  const url = new URL(`${BASE_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "2y");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "true");

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 15 },
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("text/html")) {
      return failure("html_response", "Yahoo Finance returned HTML instead of market data.");
    }
    if (!response.ok) {
      return failure(response.status === 429 ? "rate_limited" : response.status === 404 ? "not_found" : "upstream_error", `Yahoo Finance chart request failed with HTTP ${response.status}.`);
    }
    if (!contentType.includes("json")) {
      return failure("unexpected_content_type", "Yahoo Finance returned an unexpected content type.");
    }
    const payload = object(await response.json());
    if (!payload) return failure("empty_response", "Yahoo Finance returned an empty response.");
    const message = yahooError(payload);
    if (message) return failure(/not found/i.test(message) ? "not_found" : "upstream_error", `Yahoo Finance rejected the symbol: ${message}`);
    return {
      ok: true,
      data: payload,
      diagnostic: providerDiagnostic("Yahoo Finance chart", "market_data", "available"),
    };
  } catch (error) {
    return failure(error instanceof SyntaxError ? "empty_response" : "upstream_error", "Yahoo Finance chart data could not be reached or parsed.");
  }
}

function performance(rows: PriceRow[]): MarketSnapshot["performance"] {
  const current = rows.at(-1);
  if (!current) return {};
  return {
    "1D": shortReturn(rows, 1) ?? undefined,
    "1W": shortReturn(rows, 5) ?? undefined,
    "1M": shortReturn(rows, 21) ?? undefined,
    "3M": returnNearTarget(rows, shiftUtcDate(current.date, 3, 0)) ?? undefined,
    "6M": returnNearTarget(rows, shiftUtcDate(current.date, 6, 0)) ?? undefined,
    YTD: yearToDate(rows) ?? undefined,
    "1Y": returnNearTarget(rows, shiftUtcDate(current.date, 0, 1)) ?? undefined,
  };
}
export const yahooMarketDataProvider: MarketDataProvider = {
  id: PROVIDER_ID,
  capabilities: YAHOO_MARKET_CAPABILITIES,
  source: (company) => {
    const symbol = toYahooSymbol(company);
    return {
      name: "Yahoo Finance chart data",
      url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history`,
      freshness: "Daily adjusted market history and quote metadata, cached up to 15 minutes.",
    };
  },
  async fetchMarketData(company): Promise<AdapterResult<MarketSnapshot>> {
    const symbol = toYahooSymbol(company);
    const response = await requestChart(symbol);
    if (!response.ok) return response;
    const result = firstChartResult(response.data);
    if (!result) return failure("empty_response", "Yahoo Finance returned no chart result for this security.");

    const meta = object(result.meta) ?? {};
    const history = parseRows(result);
    const latest = history.at(-1);
    const price = metaNumber(meta, "regularMarketPrice") ?? latest?.close ?? null;
    if (price === null || price <= 0 || price > MAX_PRICE) {
      return failure("impossible_price", "Yahoo Finance returned no usable current market price.");
    }
    const currentDate = unixDate(meta.regularMarketTime) ?? latest?.date ?? null;
    if (currentDate && Date.parse(`${currentDate}T00:00:00Z`) > Date.now()) {
      return failure("future_date", "Yahoo Finance returned a future-dated market observation.");
    }

    const yearRows = lastYearRows(history);
    const yearHigh = metaNumber(meta, "fiftyTwoWeekHigh") ?? (yearRows.length ? Math.max(...yearRows.map((row) => row.close)) : null);
    const yearLow = metaNumber(meta, "fiftyTwoWeekLow") ?? (yearRows.length ? Math.min(...yearRows.map((row) => row.close)) : null);

    return {
      ok: true,
      data: {
        ticker: company.ticker,
        price,
        currency: stringValue(meta.currency) ?? company.currency ?? null,
        date: currentDate,
        volume: metaNumber(meta, "regularMarketVolume") ?? latest?.volume ?? null,
        yearHigh,
        yearLow,
        marketCap: null,
        sharesOutstanding: null,
        beta: null,
        provider: PROVIDER_ID,
        historyLength: history.length,
        performance: performance(history),
      },
      diagnostic: providerDiagnostic("Yahoo Finance chart", "market_data", history.length >= 250 ? "available" : "partial", history.length >= 250 ? undefined : "history_short"),
    };
  },
};
