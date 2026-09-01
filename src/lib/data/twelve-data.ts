import type {
  CompanySearchResult,
  MarketDividendEvent,
  MarketPricePoint,
  MarketSnapshot,
  MarketSplitEvent,
} from "@/lib/analysis/types";
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
const DAILY_HISTORY_POINTS = "400";
const MAX_MONTHLY_HISTORY_POINTS = "5000";
const MAX_HISTORY_START_DATE = "1970-01-01";

export const TWELVE_DATA_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["global"],
  supportedExchanges: ["provider catalog"],
  supportsFundamentals: false,
  supportsMarketData: true,
  supportsEstimates: false,
};

type JsonObject = Record<string, unknown>;
type RequestCapability = "search" | "market_data";
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

function validDate(value: unknown): string | null {
  const date = textValue(value)?.slice(0, 10) ?? null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && timestamp <= Date.now() ? date : null;
}

function failure<T>(reason: ProviderFailureReason, message: string, capability: RequestCapability): AdapterResult<T> {
  return { ok: false, reason, message, diagnostic: providerDiagnostic("Twelve Data", capability, "unavailable", reason) };
}

async function request(
  path: string,
  params: Record<string, string>,
  apiKey: string,
  capability: RequestCapability = "market_data",
): Promise<AdapterResult<JsonObject>> {
  if (!apiKey.trim()) return failure("not_configured", "Twelve Data is not configured.", capability);
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
      return failure(response.status === 429 ? "rate_limited" : "upstream_error", "Twelve Data request failed.", capability);
    }
    const payload = object(await response.json());
    if (!payload) return failure("empty_response", "Twelve Data returned an empty response.", capability);
    if (payload.status === "error") {
      const code = numberValue(payload.code);
      return failure(
        code === 429 ? "rate_limited" : code === 404 ? "not_found" : "upstream_error",
        textValue(payload.message) ?? "Twelve Data rejected the request.",
        capability,
      );
    }
    return { ok: true, data: payload, diagnostic: providerDiagnostic("Twelve Data", capability, "available") };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return failure(
      timedOut ? "timeout" : error instanceof SyntaxError ? "empty_response" : "upstream_error",
      timedOut ? "Twelve Data request timed out." : "Twelve Data could not be reached.",
      capability,
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
    const date = validDate(item?.datetime);
    const close = numberValue(item?.close);
    if (!date || close === null || close <= 0 || close > 1_000_000_000) return [];
    return [{ date, close, volume: numberValue(item?.volume) }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function monthlyPriceHistory(values: PriceRow[], currency: string | null): MarketPricePoint[] {
  const lastByMonth = new Map<string, CurrencyPricePoint>();
  for (const row of values) {
    lastByMonth.set(row.date.slice(0, 7), {
      date: row.date,
      close: row.close,
      currency,
      provider: PROVIDER_ID,
    });
  }
  return [...lastByMonth.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function dividendEvents(payload: JsonObject, fallbackCurrency: string | null): MarketDividendEvent[] {
  if (!Array.isArray(payload.dividends)) return [];
  const metaCurrency = textValue(object(payload.meta)?.currency) ?? fallbackCurrency;
  return payload.dividends.flatMap((value) => {
    const item = object(value);
    const date = validDate(item?.ex_date);
    const amount = numberValue(item?.amount);
    if (!date || amount === null || amount <= 0 || amount > 1_000_000) return [];
    return [{ date, amount, currency: metaCurrency, provider: PROVIDER_ID } satisfies MarketDividendEvent];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function splitEvents(payload: JsonObject): MarketSplitEvent[] {
  if (!Array.isArray(payload.splits)) return [];
  return payload.splits.flatMap((value) => {
    const item = object(value);
    const date = validDate(item?.date);
    const fromFactor = numberValue(item?.from_factor);
    const toFactor = numberValue(item?.to_factor);
    const documentedRatio = numberValue(item?.ratio);
    if (!date) return [];
    const numerator = fromFactor !== null && fromFactor > 0 ? fromFactor : null;
    const denominator = toFactor !== null && toFactor > 0 ? toFactor : null;
    const splitRatio = numerator !== null && denominator !== null
      ? numerator / denominator
      : documentedRatio !== null && documentedRatio > 0
        ? documentedRatio >= 1 ? documentedRatio : 1 / documentedRatio
        : null;
    if (splitRatio === null || !Number.isFinite(splitRatio) || splitRatio <= 0 || splitRatio > 10_000) return [];
    return [{ date, numerator, denominator, splitRatio, provider: PROVIDER_ID } satisfies MarketSplitEvent];
  }).sort((left, right) => left.date.localeCompare(right.date));
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
      freshness: "Provider quote, adjusted price history and corporate actions, cached up to 15 minutes.",
    }),
    async fetchMarketData(company): Promise<AdapterResult<MarketSnapshot>> {
      if (!apiKey.trim()) return failure("not_configured", "Twelve Data is not configured.", "market_data");
      const symbol = company.canonicalTicker ?? company.ticker;
      const [quoteResult, dailyHistoryResult, maxHistoryResult, statisticsResult, dividendsResult, splitsResult] = await Promise.all([
        request("/quote", { symbol }, apiKey),
        request("/time_series", {
          symbol,
          interval: "1day",
          outputsize: DAILY_HISTORY_POINTS,
          order: "ASC",
          adjust: "all",
        }, apiKey),
        request("/time_series", {
          symbol,
          interval: "1month",
          outputsize: MAX_MONTHLY_HISTORY_POINTS,
          order: "ASC",
          start_date: MAX_HISTORY_START_DATE,
          adjust: "all",
        }, apiKey),
        request("/statistics", { symbol }, apiKey),
        request("/dividends", { symbol, start_date: MAX_HISTORY_START_DATE, adjust: "true" }, apiKey),
        request("/splits", { symbol, start_date: MAX_HISTORY_START_DATE }, apiKey),
      ]);
      if (!quoteResult.ok && !dailyHistoryResult.ok && !maxHistoryResult.ok) return quoteResult;
      const quote = quoteResult.ok ? quoteResult.data : {};
      const dailyHistory = dailyHistoryResult.ok ? rows(dailyHistoryResult.data) : [];
      const maxHistory = maxHistoryResult.ok ? rows(maxHistoryResult.data) : [];
      const latest = dailyHistory.at(-1) ?? maxHistory.at(-1);
      const price = numberValue(quote.close) ?? latest?.close ?? null;
      if (price === null) return failure("empty_response", "Twelve Data returned no usable market price.", "market_data");
      if (price <= 0 || price > 1_000_000_000) return failure("impossible_price", "Twelve Data returned an invalid market price.", "market_data");
      const quoteDate = validDate(quote.datetime);
      const fiftyTwoWeek = object(quote.fifty_two_week) ?? {};
      const year = dailyHistory.slice(-252);
      const yearStart = dailyHistory.find((row) => row.date.startsWith((quoteDate ?? latest?.date ?? "").slice(0, 4)));
      const statistics = statisticsResult.ok ? statisticsResult.data : {};
      const sharesOutstanding = nestedNumber(statistics, "stock_statistics", "shares_outstanding")
        ?? nestedNumber(statistics, "statistics", "stock_statistics", "shares_outstanding");
      const marketCap = numberValue(quote.market_cap)
        ?? nestedNumber(statistics, "statistics", "valuations_metrics", "market_capitalization")
        ?? (sharesOutstanding !== null ? sharesOutstanding * price : null);
      const beta = nestedNumber(statistics, "stock_price_summary", "beta")
        ?? nestedNumber(statistics, "statistics", "stock_price_summary", "beta");
      const currency = textValue(quote.currency) ?? company.currency ?? null;
      const corporateActionsAvailable = dividendsResult.ok || splitsResult.ok;
      const priceHistory = maxHistory.length
        ? monthlyPriceHistory(maxHistory, currency)
        : monthlyPriceHistory(dailyHistory, currency);
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
          beta,
          betaMethod: beta !== null ? "provider_statistics" : null,
          provider: PROVIDER_ID,
          historyLength: priceHistory.length,
          priceHistory,
          priceHistoryBasis: "adjusted_close",
          dividendEvents: dividendsResult.ok ? dividendEvents(dividendsResult.data, currency) : [],
          splitEvents: splitsResult.ok ? splitEvents(splitsResult.data) : [],
          performance: {
            "1D": change(dailyHistory, 1) ?? undefined,
            "1W": change(dailyHistory, 5) ?? undefined,
            "1M": change(dailyHistory, 21) ?? undefined,
            "3M": change(dailyHistory, 63) ?? undefined,
            "6M": change(dailyHistory, 126) ?? undefined,
            YTD: latest && yearStart ? latest.close / yearStart.close - 1 : undefined,
            "1Y": change(dailyHistory, 252) ?? undefined,
          },
        },
        diagnostic: providerDiagnostic(
          "Twelve Data",
          "market_data",
          dailyHistoryResult.ok && maxHistoryResult.ok && statisticsResult.ok && corporateActionsAvailable ? "available" : "partial",
          !dailyHistoryResult.ok
            ? "daily_price_history_unavailable"
            : !maxHistoryResult.ok
              ? "max_price_history_unavailable"
              : !statisticsResult.ok
                ? "statistics_unavailable"
                : !corporateActionsAvailable
                  ? "corporate_actions_unavailable"
                  : undefined,
        ),
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
      const result = await request("/symbol_search", { symbol: query, outputsize: "20" }, apiKey, "search");
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
