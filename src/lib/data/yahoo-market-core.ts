import type { CompanySearchResult, MarketDividendEvent, MarketPricePoint, MarketSnapshot, MarketSplitEvent } from "@/lib/analysis/types";
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
const MIN_BETA_OBSERVATIONS = 52;
const MAX_BETA_LAG_DAYS = 21;
const YAHOO_REQUEST_TIMEOUT_MS = 10_000;
const BETA_BENCHMARK_BY_SUFFIX: Array<[string, string]> = [[".TWO", "^TWII"], [".ST", "^OMX"], [".L", "^FTSE"], [".DE", "^GDAXI"], [".F", "^GDAXI"], [".PA", "^FCHI"], [".AS", "^AEX"], [".SW", "^SSMI"], [".TO", "^GSPTSE"], [".V", "^GSPTSE"], [".AX", "^AXJO"], [".T", "^N225"], [".HK", "^HSI"], [".SS", "000001.SS"], [".SZ", "000001.SS"], [".KS", "^KS11"], [".KQ", "^KS11"], [".TW", "^TWII"], [".NS", "^NSEI"], [".BO", "^BSESN"], [".SA", "^BVSP"], [".MX", "^MXX"], [".BA", "^MERV"], [".MC", "^IBEX"], [".MI", "FTSEMIB.MI"], [".CO", "^OMXC25"], [".HE", "^OMXH25"], [".OL", "OSEAX.OL"], [".SI", "^STI"], [".JK", "^JKSE"], [".KL", "^KLSE"], [".NZ", "^NZ50"], [".AT", "FTSE.AT"], [".BK", "^SET.BK"], [".BR", "^BFX"], [".LS", "PSI20.LS"], [".SR", "^TASI.SR"], [".TA", "^TA125.TA"], [".WA", "WIG20.WA"]];
const BETA_BENCHMARK_BY_COUNTRY: Record<string, string> = { US: "^GSPC", "UNITED STATES": "^GSPC", SE: "^OMX", SWEDEN: "^OMX", GB: "^FTSE", UK: "^FTSE", "UNITED KINGDOM": "^FTSE", DE: "^GDAXI", GERMANY: "^GDAXI", FR: "^FCHI", FRANCE: "^FCHI", NL: "^AEX", NETHERLANDS: "^AEX", CH: "^SSMI", SWITZERLAND: "^SSMI", CA: "^GSPTSE", CANADA: "^GSPTSE", AU: "^AXJO", AUSTRALIA: "^AXJO", JP: "^N225", JAPAN: "^N225", HK: "^HSI", "HONG KONG": "^HSI", CN: "000001.SS", CHINA: "000001.SS", KR: "^KS11", "SOUTH KOREA": "^KS11", TW: "^TWII", TAIWAN: "^TWII", IN: "^NSEI", INDIA: "^NSEI", BR: "^BVSP", BRAZIL: "^BVSP", MX: "^MXX", MEXICO: "^MXX", AR: "^MERV", ARGENTINA: "^MERV", ES: "^IBEX", SPAIN: "^IBEX", IT: "FTSEMIB.MI", ITALY: "FTSEMIB.MI", DK: "^OMXC25", DENMARK: "^OMXC25", FI: "^OMXH25", FINLAND: "^OMXH25", NO: "OSEAX.OL", NORWAY: "OSEAX.OL", SG: "^STI", SINGAPORE: "^STI", ID: "^JKSE", INDONESIA: "^JKSE", MY: "^KLSE", MALAYSIA: "^KLSE", NZ: "^NZ50", "NEW ZEALAND": "^NZ50" };
const BETA_BENCHMARK_BY_EXCHANGE: Record<string, string> = {
  AMEX: "^GSPC",
  NASDAQ: "^GSPC",
  NASDAQCM: "^GSPC",
  NASDAQGM: "^GSPC",
  NASDAQGS: "^GSPC",
  "NASDAQ CAPITAL MARKET": "^GSPC",
  "NASDAQ GLOBAL MARKET": "^GSPC",
  "NASDAQ GLOBAL SELECT": "^GSPC",
  "NEW YORK STOCK EXCHANGE": "^GSPC",
  NYQ: "^GSPC",
  NYSE: "^GSPC",
  "NYSE AMERICAN": "^GSPC",
  NYSEAMERICAN: "^GSPC",
  "NYSE ARCA": "^GSPC",
  "NYSE MKT": "^GSPC",
  BATS: "^GSPC",
  "BATS TRADING": "^GSPC",
  BZX: "^GSPC",
  "CBOE BZX": "^GSPC",
  OTC: "^GSPC",
  "OTC MARKETS": "^GSPC",
  OQB: "^GSPC",
  OQX: "^GSPC",
  OID: "^GSPC",
  "OTC QB": "^GSPC",
  "OTC QX": "^GSPC",
  OTCQB: "^GSPC",
  OTCQX: "^GSPC",
  "OTHER OTC": "^GSPC",
  PNK: "^GSPC",
  FRANKFURT: "^GDAXI",
  "FRANKFURT STOCK EXCHANGE": "^GDAXI",
  "BUENOS AIRES": "^MERV",
  "BUENOS AIRES STOCK EXCHANGE": "^MERV",
};

export const YAHOO_MARKET_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["global"],
  supportedExchanges: ["Yahoo Finance chart catalog"],
  supportsFundamentals: false,
  supportsMarketData: true,
  supportsEstimates: false,
};

type JsonObject = Record<string, unknown>;
type PriceRow = { date: string; close: number; volume: number | null };
type CurrencyPricePoint = MarketPricePoint & { currency?: string | null; provider?: string };

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

function betaBenchmarkSymbol(company: CompanySearchResult): string | null {
  const symbol = toYahooSymbol(company);
  const suffixMatch = BETA_BENCHMARK_BY_SUFFIX.find(([suffix]) => symbol.endsWith(suffix));
  if (suffixMatch) return suffixMatch[1];
  const country = company.country?.trim().toUpperCase();
  const countryBenchmark = country ? BETA_BENCHMARK_BY_COUNTRY[country] ?? null : null;
  if (countryBenchmark) return countryBenchmark;
  const exchange = company.exchange?.trim().toUpperCase();
  if (!exchange) return null;
  const compactExchange = exchange.replace(/[^A-Z0-9]/g, "");
  return BETA_BENCHMARK_BY_EXCHANGE[exchange] ?? BETA_BENCHMARK_BY_EXCHANGE[compactExchange] ?? null;
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

function parseDividendEvents(result: JsonObject, currency: string | null): MarketDividendEvent[] {
  const events = object(result.events);
  const dividends = object(events?.dividends);
  if (!dividends) return [];
  const deduped = new Map<string, MarketDividendEvent>();
  for (const eventValue of Object.values(dividends)) {
    const event = object(eventValue);
    const amount = numberValue(event?.amount);
    const date = dateFromUnix(numberValue(event?.date) ?? Number.NaN);
    if (!date || amount === null || amount <= 0 || Date.parse(`${date}T00:00:00Z`) > Date.now()) continue;
    deduped.set(`${date}:${amount}`, { date, amount, currency, provider: PROVIDER_ID });
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
    const ratioFromNumbers = numerator !== null && denominator !== null && numerator > 0 && denominator > 0 ? numerator / denominator : null;
    const ratioText = stringValue(event?.splitRatio);
    const ratioParts = ratioText?.split(":").map(Number) ?? [];
    const ratioFromText = ratioParts.length === 2 && Number.isFinite(ratioParts[0]) && Number.isFinite(ratioParts[1]) && ratioParts[1] > 0
      ? ratioParts[0] / ratioParts[1]
      : null;
    return [{ date, numerator, denominator, splitRatio: ratioFromNumbers ?? ratioFromText, provider: PROVIDER_ID }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

function monthlyPriceHistory(rows: PriceRow[], currency: string | null): MarketPricePoint[] {
  const byMonth = new Map<string, CurrencyPricePoint>();
  for (const row of rows) {
    byMonth.set(row.date.slice(0, 7), {
      date: row.date,
      close: row.close,
      currency,
      provider: PROVIDER_ID,
    });
  }
  return [...byMonth.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function weekKey(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const daysSinceMonday = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceMonday);
  return value.toISOString().slice(0, 10);
}

function historicalWeeklyBeta(stockRows: PriceRow[], benchmarkRows: PriceRow[]): { beta: number; observations: number } | null {
  const stockWeekly = new Map<string, PriceRow>();
  const benchmarkWeekly = new Map<string, PriceRow>();
  stockRows.forEach((row) => stockWeekly.set(weekKey(row.date), row));
  benchmarkRows.forEach((row) => benchmarkWeekly.set(weekKey(row.date), row));
  const commonWeeks = [...stockWeekly.keys()].filter((key) => benchmarkWeekly.has(key)).sort();
  const latestCommonWeek = commonWeeks.at(-1);
  const latestStockWeek = stockRows.at(-1) ? weekKey(stockRows.at(-1)!.date) : null;
  const latestBenchmarkWeek = benchmarkRows.at(-1) ? weekKey(benchmarkRows.at(-1)!.date) : null;
  if (!latestCommonWeek || !latestStockWeek || !latestBenchmarkWeek) return null;
  const commonTime = Date.parse(`${latestCommonWeek}T00:00:00Z`);
  const stockLag = (Date.parse(`${latestStockWeek}T00:00:00Z`) - commonTime) / 86_400_000;
  const benchmarkLag = (Date.parse(`${latestBenchmarkWeek}T00:00:00Z`) - commonTime) / 86_400_000;
  if (stockLag > MAX_BETA_LAG_DAYS || benchmarkLag > MAX_BETA_LAG_DAYS) return null;
  const pairs: Array<{ stock: number; benchmark: number }> = [];
  for (let index = 1; index < commonWeeks.length; index += 1) {
    const previousKey = commonWeeks[index - 1]; const currentKey = commonWeeks[index];
    if ((Date.parse(`${currentKey}T00:00:00Z`) - Date.parse(`${previousKey}T00:00:00Z`)) / 86_400_000 !== 7) continue;
    const previousStock = stockWeekly.get(previousKey)!; const currentStock = stockWeekly.get(currentKey)!;
    const previousBenchmark = benchmarkWeekly.get(previousKey)!; const currentBenchmark = benchmarkWeekly.get(currentKey)!;
    pairs.push({ stock: currentStock.close / previousStock.close - 1, benchmark: currentBenchmark.close / previousBenchmark.close - 1 });
  }
  if (pairs.length < MIN_BETA_OBSERVATIONS) return null;
  const stockMean = pairs.reduce((sum, item) => sum + item.stock, 0) / pairs.length;
  const benchmarkMean = pairs.reduce((sum, item) => sum + item.benchmark, 0) / pairs.length;
  const variance = pairs.reduce((sum, item) => sum + (item.benchmark - benchmarkMean) ** 2, 0);
  if (!Number.isFinite(variance) || variance <= 1e-8) return null;
  const covariance = pairs.reduce((sum, item) => sum + (item.stock - stockMean) * (item.benchmark - benchmarkMean), 0);
  const beta = covariance / variance;
  return Number.isFinite(beta) ? { beta, observations: pairs.length } : null;
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
async function requestChart(symbol: string, range: "2y" | "10y" = "2y"): Promise<AdapterResult<JsonObject>> {
  const url = new URL(`${BASE_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", range);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "true");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
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
    const timedOut = error instanceof Error && error.name === "AbortError";
    return failure(
      timedOut ? "timeout" : error instanceof SyntaxError ? "empty_response" : "upstream_error",
      timedOut
        ? "Yahoo Finance chart request timed out."
        : "Yahoo Finance chart data could not be reached or parsed.",
    );
  } finally {
    clearTimeout(timeout);
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
    const benchmarkSymbol = betaBenchmarkSymbol(company);
    const response = await requestChart(symbol, "10y");
    if (!response.ok) return response;
    const result = firstChartResult(response.data);
    if (!result) return failure("empty_response", "Yahoo Finance returned no chart result for this security.");

    const meta = object(result.meta) ?? {};
    const history = parseRows(result);
    const latest = history.at(-1);
    const metaDate = unixDate(meta.regularMarketTime);
    const historyIsNewer = Boolean(latest?.date && metaDate && latest.date > metaDate);
    const price = historyIsNewer ? latest?.close ?? null : metaNumber(meta, "regularMarketPrice") ?? latest?.close ?? null;
    if (price === null || price <= 0 || price > MAX_PRICE) {
      return failure("impossible_price", "Yahoo Finance returned no usable current market price.");
    }
    const currentDate = historyIsNewer ? latest?.date ?? null : metaDate ?? latest?.date ?? null;
    if (currentDate && Date.parse(`${currentDate}T00:00:00Z`) > Date.now()) {
      return failure("future_date", "Yahoo Finance returned a future-dated market observation.");
    }

    const benchmarkResponse = benchmarkSymbol ? await requestChart(benchmarkSymbol) : null;
    const benchmarkResult = benchmarkResponse?.ok ? firstChartResult(benchmarkResponse.data) : null;
    const betaEstimate = benchmarkResult ? historicalWeeklyBeta(history, parseRows(benchmarkResult)) : null;
    const yearRows = lastYearRows(history);
    const marketCurrency = stringValue(meta.currency) ?? company.currency ?? null;
    const dividendEvents = parseDividendEvents(result, marketCurrency);
    const splitEvents = parseSplitEvents(result);
    const yearHigh = metaNumber(meta, "fiftyTwoWeekHigh") ?? (yearRows.length ? Math.max(...yearRows.map((row) => row.close)) : null);
    const yearLow = metaNumber(meta, "fiftyTwoWeekLow") ?? (yearRows.length ? Math.min(...yearRows.map((row) => row.close)) : null);

    return {
      ok: true,
      data: {
        ticker: company.ticker,
        price,
        currency: marketCurrency,
        date: currentDate,
        volume: historyIsNewer ? latest?.volume ?? null : metaNumber(meta, "regularMarketVolume") ?? latest?.volume ?? null,
        yearHigh,
        yearLow,
        marketCap: null,
        sharesOutstanding: null,
        beta: betaEstimate?.beta ?? null,
        betaBenchmark: betaEstimate ? benchmarkSymbol : null,
        betaMethod: betaEstimate ? "historical_weekly_regression" : null,
        betaObservationCount: betaEstimate?.observations ?? null,
        provider: PROVIDER_ID,
        historyLength: history.length,
        priceHistory: monthlyPriceHistory(history, marketCurrency),
        priceHistoryBasis: "adjusted_close",
        dividendEvents,
        splitEvents,
        performance: performance(history),
      },
      diagnostic: providerDiagnostic("Yahoo Finance chart", "market_data", history.length >= 250 ? "available" : "partial", history.length >= 250 ? undefined : "history_short"),
    };
  },
};