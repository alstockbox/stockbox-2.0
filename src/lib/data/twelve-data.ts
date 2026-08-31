import type { CompanySearchResult, MarketPricePoint, MarketSnapshot } from "@/lib/analysis/types";
import {
  providerDiagnostic,
  type AdapterResult,
  type CompanySearchProvider,
  type MarketDataProvider,
  type ProviderCapabilities,
  type ProviderFailureReason,
} from "./providers";

const PROVIDER_ID = "twelve-data";
const BASE_URL = "https://api.twelvedata.com";
const TWELVE_DATA_REQUEST_TIMEOUT_MS = 10_000;

export const TWELVE_DATA_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["global"],
  supportedExchanges: ["provider catalog"],
  supportsFundamentals: false,
  supportsMarketData: true,
  supportsEstimates: false,
};

type JsonObject = Record<string, unknown>;
type CurrencyPricePoint = MarketPricePoint & { currency?: string | null; provider?: string };

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function failure<T>(reason: ProviderFailureReason, message: string, capability: "search" | "market_data"): AdapterResult<T> {
  return { ok: false, reason, message, diagnostic: providerDiagnostic("Twelve Data", capability, "unavailable", reason) };
}

async function request(path: string, params: Record<string, string>, apiKey: string): Promise<AdapterResult<JsonObject>> {
  if (!apiKey.trim()) return failure("not_configured", "Twelve Data is not configured.", "market_data");
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("apikey", apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TWELVE_DATA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 60 * 15 },
    });
    if (!response.ok) {
      return failure(response.status === 429 ? "rate_limited" : "upstream_error", "Twelve Data request failed.", "market_data");
    }
    const payload = object(await response.json());
    if (!payload) return failure("empty_response", "Twelve Data returned an empty response.", "market_data");
    if (payload.status === "error") {
      const code = numberValue(payload.code);
      return failure(code === 429 ? "rate_limited" : code === 404 ? "not_found" : "upstream_error", textValue(payload.message) ?? "Twelve Data rejected the request.", "market_data");
    }
    return { ok: true, data: payload, diagnostic: providerDiagnostic("Twelve Data", "market_data", "available") };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return failure(
      timedOut ? "timeout" : error instanceof SyntaxError ? "empty_response" : "upstream_error",
      timedOut ? "Twelve Data request timed out." : "Twelve Data could not be reached.",
      "market_data",
    );
  } finally {
    clearTimeout(timeout);
  }
}

type PriceRow = { date: string; close: number; volume: number | null };

function rows(payload: JsonObject): PriceRow[] {
  if (!Array.isArray(payload.values)) return [];
  return payload.values.flatMap((value) => {
    const item = object(value);
    const date = textValue(item?.datetime)?.slice(0, 10) ?? null;
    const close = numberValue(item?.close);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Date.parse(`${date}T00:00:00Z`) > Date.now() || close === null || close <= 0 || close > 1_000_000_000) return [];
    return [{ date, close, volume: numberValue(item?.volume) }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function monthlyPriceHistory(values: PriceRow[], currency: string | null): MarketPricePoint[] {
  const byMonth = new Map<string, CurrencyPricePoint>();
  for (const row of values) {
    byMonth.set(row.date.slice(0, 7), {
      date: row.date,
      close: row.close,
      currency,
      provider: PROVIDER_ID,
    });
  }
  return [...byMonth.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function change(values: PriceRow[], periods: number): number | null {
  const current = values.at(-1);
  const prior = values.at(-1 - periods);
  return current && prior && prior.close > 0 ? current.close / prior.close - 1 : null;
}

function nestedNumber(payload: JsonObject, ...path: string[]): number | null {
  let current: unknown = payload;
  for (const part of path) current = object(current)?.[part];
  return numberValue(current);
}

export function createTwelveDataMarketProvider(apiKey: string): MarketDataProvider {
  return {
    id: PROVIDER_ID,
    capabilities: TWELVE_DATA_CAPABILITIES,
    source: () => ({
      name: "Twelve Data market data",
      url: "https://twelvedata.com/docs",
      freshness: "Provider quote and daily history, cached up to 15 minutes.",
    }),
    async fetchMarketData(company): Promise<AdapterResult<MarketSnapshot>> {
      if (!apiKey.trim()) return failure("not_configured", "Twelve Data is not configured.", "market_data");
      const symbol = company.canonicalTicker ?? company.ticker;
      const [quoteResult, historyResult, statisticsResult] = await Promise.all([
        request("/quote", { symbol }, apiKey),
        request("/time_series", { symbol, interval: "1day", outputsize: "5000", order: "ASC" }, apiKey),
        request("/statistics", { symbol }, apiKey),
      ]);
      if (!quoteResult.ok && !historyResult.ok) return quoteResult;
      const quote = quoteResult.ok ? quoteResult.data : {};
      const history = historyResult.ok ? rows(historyResult.data) : [];
      const latest = history.at(-1);
      const price = numberValue(quote.close) ?? latest?.close ?? null;
      if (price === null) return failure("empty_response", "Twelve Data returned no usable market price.", "market_data");
      if (price <= 0 || price > 1_000_000_000) return failure("impossible_price", "Twelve Data returned an invalid market price.", "market_data");
      const quoteDate = textValue(quote.datetime)?.slice(0, 10) ?? null;
      if (quoteDate && Date.parse(`${quoteDate}T00:00:00Z`) > Date.now()) return failure("future_date", "Twelve Data returned a future-dated market observation.", "market_data");
      const fiftyTwoWeek = object(quote.fifty_two_week) ?? {};
      const year = history.slice(-252);
      const yearStart = history.find((row) => row.date.startsWith((textValue(quote.datetime) ?? latest?.date ?? "").slice(0, 4)));
      const statistics = statisticsResult.ok ? statisticsResult.data : {};
      const sharesOutstanding = nestedNumber(statistics, "stock_statistics", "shares_outstanding");
      const marketCap = numberValue(quote.market_cap) ?? (sharesOutstanding !== null ? sharesOutstanding * price : null);
      const currency = textValue(quote.currency) ?? company.currency ?? null;
      return {
        ok: true,
        data: {
          ticker: company.ticker,
          price,
          currency,
          date: quoteDate ?? latest?.date ?? null,
          volume: numberValue(quote.volume) ?? latest?.volume ?? null,
          yearHigh: numberValue(fiftyTwoWeek.high) ?? (year.length ? Math.max(...year.map((row) => row.close)) : null),
          yearLow: numberValue(fiftyTwoWeek.low) ?? (year.length ? Math.min(...year.map((row) => row.close)) : null),
          marketCap,
          sharesOutstanding,
          beta: nestedNumber(statistics, "stock_price_summary", "beta"),
          provider: PROVIDER_ID,
          historyLength: history.length,
          priceHistory: monthlyPriceHistory(history, currency),
          priceHistoryBasis: "close",
          performance: {
            "1D": change(history, 1) ?? undefined,
            "1W": change(history, 5) ?? undefined,
            "1M": change(history, 21) ?? undefined,
            "3M": change(history, 63) ?? undefined,
            "6M": change(history, 126) ?? undefined,
            YTD: latest && yearStart ? latest.close / yearStart.close - 1 : undefined,
            "1Y": change(history, 252) ?? undefined,
          },
        },
        diagnostic: providerDiagnostic("Twelve Data", "market_data", statisticsResult.ok ? "available" : "partial", statisticsResult.ok ? undefined : "statistics_unavailable"),
      };
    },
  };
}

export function createTwelveDataSearchProvider(apiKey: string): CompanySearchProvider {
  return {
    id: "twelve-data-symbol-search",
    capabilities: TWELVE_DATA_CAPABILITIES,
    async search(query): Promise<AdapterResult<CompanySearchResult[]>> {
      if (!apiKey.trim()) return failure("not_configured", "Twelve Data search is not configured.", "search");
      const result = await request("/symbol_search", { symbol: query, outputsize: "20" }, apiKey);
      if (!result.ok) return { ...result, diagnostic: providerDiagnostic("Twelve Data", "search", "unavailable", result.reason) };
      const values = Array.isArray(result.data.data) ? result.data.data : [];
      const companies = values.flatMap((value) => {
        const item = object(value);
        const ticker = textValue(item?.symbol);
        const name = textValue(item?.instrument_name);
        if (!ticker || !name) return [];
        const instrumentType = textValue(item?.instrument_type)?.toLowerCase() ?? "";
        const securityType: CompanySearchResult["securityType"] = instrumentType.includes("depositary") ? "ADR"
          : instrumentType.includes("fund") || instrumentType.includes("etf") ? "ETF/Fund"
          : instrumentType.includes("preferred") ? "Preferred" : "Common Stock";
        return [{
          ticker,
          canonicalTicker: ticker,
          name,
          exchange: textValue(item?.exchange) ?? undefined,
          country: textValue(item?.country) ?? undefined,
          currency: textValue(item?.currency) ?? undefined,
          securityType,
          providerCapabilities: { fundamentals: false, marketData: true, providerIds: [PROVIDER_ID] },
        } satisfies CompanySearchResult];
      });
      return { ok: true, data: companies, diagnostic: providerDiagnostic("Twelve Data", "search", "available") };
    },
  };
}
