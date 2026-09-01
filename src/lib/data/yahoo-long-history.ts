import type { AnalysisSource, CompanySearchResult, MarketDividendEvent, ProviderDiagnostic } from "@/lib/analysis/types";
import type { VerifiedMarketHistoryEnrichment } from "@/lib/analysis/market-history-enrichment";
import { providerDiagnostic } from "./providers";

const PROVIDER_ID = "yahoo-long-history";
const BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const REQUEST_TIMEOUT_MS = 10_000;

type JsonObject = Record<string, unknown>;
type CurrencyPricePoint = VerifiedMarketHistoryEnrichment["priceHistory"][number];

export type YahooLongHistoryResult =
  | { ok: true; data: VerifiedMarketHistoryEnrichment; diagnostic: ProviderDiagnostic; source: AnalysisSource }
  | { ok: false; diagnostic: ProviderDiagnostic; reason: string };

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

function dateFromUnix(value: unknown): string | null {
  const timestamp = numberValue(value);
  if (timestamp === null || timestamp <= 0) return null;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function yahooSymbol(company: CompanySearchResult): string {
  const symbol = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  if ((company.country ?? "").trim().toUpperCase() === "US" && symbol.includes(".")) return symbol.replaceAll(".", "-");
  return symbol;
}

function failure(reason: string): YahooLongHistoryResult {
  return {
    ok: false,
    reason,
    diagnostic: providerDiagnostic("Yahoo Finance long history", "market_data", "unavailable", reason),
  };
}

function parsePriceHistory(result: JsonObject, currency: string): CurrencyPricePoint[] {
  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const indicators = object(result.indicators);
  const quote = Array.isArray(indicators?.quote) ? object(indicators.quote[0]) : null;
  const closes = Array.isArray(quote?.close) ? quote.close : [];
  const deduped = new Map<string, CurrencyPricePoint>();
  timestamps.forEach((timestamp, index) => {
    const date = dateFromUnix(timestamp);
    const close = numberValue(closes[index]);
    if (!date || close === null || close <= 0 || close > 1_000_000_000) return;
    if (Date.parse(`${date}T00:00:00Z`) > Date.now()) return;
    deduped.set(date.slice(0, 7), { date, close, currency, provider: PROVIDER_ID });
  });
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function parseDividends(result: JsonObject, currency: string): MarketDividendEvent[] {
  const dividends = object(object(result.events)?.dividends);
  if (!dividends) return [];
  const deduped = new Map<string, MarketDividendEvent>();
  for (const raw of Object.values(dividends)) {
    const event = object(raw);
    const date = dateFromUnix(event?.date);
    const amount = numberValue(event?.amount);
    if (!date || amount === null || amount <= 0 || Date.parse(`${date}T00:00:00Z`) > Date.now()) continue;
    deduped.set(`${date}:${amount}`, { date, amount, currency, provider: PROVIDER_ID });
  }
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export async function fetchYahooLongHistory(company: CompanySearchResult): Promise<YahooLongHistoryResult> {
  const symbol = yahooSymbol(company);
  const url = new URL(`${BASE_URL}/${encodeURIComponent(symbol)}`);
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
      next: { revalidate: 60 * 30 },
    });
    if (!response.ok) return failure(response.status === 429 ? "rate_limited" : `http_${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("json")) return failure("unexpected_content_type");
    const payload = object(await response.json());
    const chart = object(payload?.chart);
    const results = Array.isArray(chart?.result) ? chart.result : [];
    const result = object(results[0]);
    const error = object(chart?.error);
    if (!result) return failure(stringValue(error?.description) ?? "empty_response");
    const currency = stringValue(object(result.meta)?.currency);
    if (!currency) return failure("currency_unknown");
    const priceHistory = parsePriceHistory(result, currency);
    const dividendEvents = parseDividends(result, currency);
    if (!priceHistory.length && !dividendEvents.length) return failure("empty_history");
    const observedAt = new Date().toISOString();
    return {
      ok: true,
      data: { quoteCurrency: currency, priceHistory, dividendEvents, provider: PROVIDER_ID },
      diagnostic: providerDiagnostic(
        "Yahoo Finance long history",
        "market_data",
        priceHistory.length >= 120 ? "available" : "partial",
        priceHistory.length >= 120 ? undefined : "history_short",
      ),
      source: {
        name: "Yahoo Finance long market history",
        url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/history`,
        accessedAt: observedAt,
        freshness: "Monthly historical prices and corporate actions, cached up to 30 minutes.",
        provider: PROVIDER_ID,
        capability: "market_data",
        dataAsOf: priceHistory.at(-1)?.date ?? dividendEvents.at(-1)?.date ?? null,
      },
    };
  } catch (error) {
    return failure(error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_error");
  } finally {
    clearTimeout(timeout);
  }
}
