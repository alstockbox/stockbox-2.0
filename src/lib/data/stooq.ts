import type { CompanySearchResult, MarketSnapshot } from "@/lib/analysis/types";
import {
  providerDiagnostic,
  type AdapterResult,
  type MarketDataProvider,
  type ProviderCapabilities,
  type ProviderFailureReason,
} from "./providers";

type PriceRow = { date: string; close: number; volume: number | null };
type StooqSymbol = { symbol: string; currency: string | null };
type ResponseFormat = "csv" | "html" | "text" | "empty" | "unknown";
type CsvFailureReason =
  | "unexpected_columns"
  | "invalid_row"
  | "future_date"
  | "impossible_price";
type CsvParseResult =
  | { ok: true; rows: PriceRow[]; headerColumns: string[] }
  | { ok: false; reason: CsvFailureReason; headerColumns: string[] };

const STOOQ_PROVIDER_ID = "stooq-eod";
const STOOQ_TIMEOUT_MS = 8_000;
const STOOQ_RETRIES = 2;
const MAX_REASONABLE_CLOSE = 1_000_000_000;
const US_EXCHANGES = new Set(["US", "NYSE", "NASDAQ", "NYSE AMERICAN", "AMEX"]);
const CSV_CONTENT_TYPES = new Set([
  "application/csv",
  "application/octet-stream",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

export const STOOQ_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["US"],
  supportedExchanges: ["NYSE", "Nasdaq", "NYSE American"],
  supportsFundamentals: false,
  supportsMarketData: true,
  supportsEstimates: false,
};

export function mapStooqSymbol(company: Pick<CompanySearchResult, "ticker" | "country" | "exchange">): StooqSymbol | null {
  const ticker = company.ticker.trim().toLowerCase();
  if (!ticker) return null;
  if (ticker.endsWith(".us")) return { symbol: ticker.replace(/\.([^.]+)\.us$/, "-$1.us"), currency: "USD" };
  const isUs = company.country?.toUpperCase() === "US" || US_EXCHANGES.has(company.exchange?.toUpperCase() ?? "");
  if (!isUs) return null;
  return { symbol: `${ticker.replace(/\./g, "-")}.us`, currency: "USD" };
}

function splitCsvRow(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function normalizedBody(csv: string): string {
  return csv.replace(/^\uFEFF/, "").trim();
}

function parseStooqCsvResult(csv: string, now = new Date()): CsvParseResult {
  const body = normalizedBody(csv);
  const [header = "", ...lines] = body.split(/\r?\n/);
  const headerColumns = splitCsvRow(header).map((item) => item.trim().toLowerCase());
  const dateIndex = headerColumns.indexOf("date");
  const closeIndex = headerColumns.indexOf("close");
  const volumeIndex = headerColumns.indexOf("volume");
  if (dateIndex < 0 || closeIndex < 0) {
    return { ok: false, reason: "unexpected_columns", headerColumns };
  }

  const currentDate = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const rowsByDate = new Map<string, PriceRow>();
  for (const line of lines.filter((item) => item.trim())) {
    const values = splitCsvRow(line);
    const date = values[dateIndex]?.trim() ?? "";
    const closeText = values[closeIndex]?.trim() ?? "";
    const volumeText = volumeIndex >= 0 ? values[volumeIndex]?.trim() ?? "" : "";
    const dateValue = Date.parse(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(dateValue)
      || new Date(dateValue).toISOString().slice(0, 10) !== date
    ) {
      return { ok: false, reason: "invalid_row", headerColumns };
    }
    if (dateValue > currentDate) return { ok: false, reason: "future_date", headerColumns };

    const close = Number(closeText);
    if (!Number.isFinite(close) || close <= 0 || close > MAX_REASONABLE_CLOSE) {
      return { ok: false, reason: "impossible_price", headerColumns };
    }
    const volume = !volumeText || /^N\/D$/i.test(volumeText) ? null : Number(volumeText);
    if (volume !== null && (!Number.isFinite(volume) || volume < 0)) {
      return { ok: false, reason: "invalid_row", headerColumns };
    }
    rowsByDate.set(date, { date, close, volume });
  }
  const rows = [...rowsByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  return rows.length
    ? { ok: true, rows, headerColumns }
    : { ok: false, reason: "invalid_row", headerColumns };
}

export function parseStooqCsv(csv: string, now = new Date()): PriceRow[] | null {
  const parsed = parseStooqCsvResult(csv, now);
  return parsed.ok ? parsed.rows : null;
}

function responseFormat(body: string, contentType: string | null): ResponseFormat {
  const normalized = normalizedBody(body);
  if (!normalized) return "empty";
  if (/text\/html/i.test(contentType ?? "") || /^<!doctype html|^<html/i.test(normalized)) return "html";
  const firstLine = normalized.split(/\r?\n/, 1)[0] ?? "";
  const columns = splitCsvRow(firstLine).map((item) => item.toLowerCase());
  if (columns.includes("date") && columns.includes("close")) return "csv";
  if ((contentType ?? "").toLowerCase().startsWith("text/")) return "text";
  return "unknown";
}

function contentLength(response: Response, body?: string): number | null {
  const header = response.headers.get("content-length");
  const declared = header === null ? Number.NaN : Number(header);
  return Number.isFinite(declared) && declared >= 0 ? declared : body?.length ?? null;
}

function safeProviderDiagnostic(input: {
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  symbol: string;
  responseFormat: ResponseFormat;
  headerColumns: string[];
  parseFailure: ProviderFailureReason;
}): void {
  console.error("Market data provider response rejected", {
    ...input,
    resolvedProvider: STOOQ_PROVIDER_ID,
  });
}

function performance(rows: PriceRow[], tradingDays: number): number | null {
  if (rows.length <= tradingDays) return null;
  const latest = rows.at(-1);
  const prior = rows.at(rows.length - 1 - tradingDays);
  return latest && prior && prior.close > 0 ? latest.close / prior.close - 1 : null;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function failure(reason: ProviderFailureReason, message: string): AdapterResult<MarketSnapshot> {
  return {
    ok: false,
    reason,
    message,
    diagnostic: providerDiagnostic(
      "Stooq",
      "market_data",
      reason === "unsupported_symbol" ? "unsupported" : "unavailable",
      reason,
    ),
  };
}

function parseFailureMessage(reason: ProviderFailureReason): string {
  if (reason === "html_response") return "Stooq returned HTML instead of market data.";
  if (reason === "unexpected_content_type") return "Stooq returned an unsupported response content type.";
  if (reason === "unexpected_columns") return "Stooq returned CSV without the required Date and Close columns.";
  if (reason === "future_date") return "Stooq returned a future-dated market observation.";
  if (reason === "impossible_price") return "Stooq returned an invalid market price.";
  return "Stooq returned invalid market data rows.";
}

export async function fetchStooqMarketData(
  company: CompanySearchResult,
  options: { timeoutMs?: number; retries?: number } = {},
): Promise<AdapterResult<MarketSnapshot>> {
  const mapped = mapStooqSymbol(company);
  if (!mapped) return failure("unsupported_symbol", "The configured Stooq adapter supports explicitly identified US listings only.");
  const retries = options.retries ?? STOOQ_RETRIES;
  let lastReason: ProviderFailureReason = "upstream_error";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? STOOQ_TIMEOUT_MS);
    try {
      const response = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(mapped.symbol)}&i=d`, {
        signal: controller.signal,
        next: { revalidate: 60 * 15 },
      });
      const responseContentType = response.headers.get("content-type");
      if (!response.ok) {
        lastReason = response.status === 429 ? "rate_limited" : response.status >= 500 ? "upstream_error" : "not_found";
        safeProviderDiagnostic({
          httpStatus: response.status,
          contentType: responseContentType,
          contentLength: contentLength(response),
          symbol: mapped.symbol,
          responseFormat: "unknown",
          headerColumns: [],
          parseFailure: lastReason,
        });
        if (response.status < 500 && response.status !== 429) {
          return failure(lastReason, "Stooq did not return market history for this symbol.");
        }
      } else {
        const body = await response.text();
        const format = responseFormat(body, responseContentType);
        const headerColumns = format === "html" || format === "empty"
          ? []
          : splitCsvRow(normalizedBody(body).split(/\r?\n/, 1)[0] ?? "");
        let parseFailure: ProviderFailureReason | null = null;
        if (format === "empty") parseFailure = "empty_response";
        else if (/exceeded|rate.?limit/i.test(body)) parseFailure = "rate_limited";
        else if (/^\s*N\/D\s*$/i.test(body)) parseFailure = "not_found";
        else if (format === "html") parseFailure = "html_response";
        else {
          const mediaType = responseContentType?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
          if (mediaType && !CSV_CONTENT_TYPES.has(mediaType)) parseFailure = "unexpected_content_type";
        }
        const parsed = parseFailure ? null : parseStooqCsvResult(body);
        if (!parseFailure && parsed && !parsed.ok) parseFailure = parsed.reason;
        if (parseFailure) {
          safeProviderDiagnostic({
            httpStatus: response.status,
            contentType: responseContentType,
            contentLength: contentLength(response, body),
            symbol: mapped.symbol,
            responseFormat: format,
            headerColumns: parsed?.headerColumns ?? headerColumns,
            parseFailure,
          });
          if (["rate_limited", "upstream_error"].includes(parseFailure)) {
            lastReason = parseFailure;
          } else {
            return failure(
              parseFailure,
              parseFailure === "empty_response"
                ? "Stooq returned an empty response."
                : parseFailure === "not_found"
                  ? "Stooq reported no data for this symbol."
                  : parseFailureMessage(parseFailure),
            );
          }
        } else if (parsed?.ok) {
          const rows = parsed.rows;
          const latest = rows.at(-1) as PriceRow;
          const year = rows.slice(-252);
          const yearStart = rows.find((row) => row.date.startsWith(latest.date.slice(0, 4)));
          return {
            ok: true,
            data: {
              ticker: company.ticker,
              price: latest.close,
              currency: mapped.currency,
              date: latest.date,
              volume: latest.volume,
              yearHigh: Math.max(...year.map((row) => row.close)),
              yearLow: Math.min(...year.map((row) => row.close)),
              performance: {
                "1D": performance(rows, 1) ?? undefined,
                "1W": performance(rows, 5) ?? undefined,
                "1M": performance(rows, 21) ?? undefined,
                "3M": performance(rows, 63) ?? undefined,
                "6M": performance(rows, 126) ?? undefined,
                YTD: yearStart ? latest.close / yearStart.close - 1 : undefined,
                "1Y": performance(rows, 252) ?? undefined,
              },
            },
            diagnostic: providerDiagnostic("Stooq", "market_data", "available"),
          };
        }
      }
    } catch (error) {
      lastReason = error instanceof Error && error.name === "AbortError" ? "timeout" : "upstream_error";
      safeProviderDiagnostic({
        httpStatus: null,
        contentType: null,
        contentLength: null,
        symbol: mapped.symbol,
        responseFormat: "unknown",
        headerColumns: [],
        parseFailure: lastReason,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < retries) await delay(150 * 2 ** attempt);
  }
  return failure(lastReason, lastReason === "timeout" ? "Stooq request timed out." : "Stooq market data is temporarily unavailable.");
}

export async function fetchMarketSnapshot(company: CompanySearchResult | string): Promise<MarketSnapshot | null> {
  const normalized = typeof company === "string" ? { ticker: company, name: company } : company;
  const result = await fetchStooqMarketData(normalized);
  return result.ok ? result.data : null;
}

export const stooqMarketDataProvider: MarketDataProvider = {
  id: STOOQ_PROVIDER_ID,
  capabilities: STOOQ_CAPABILITIES,
  source(company) {
    return {
      name: "Stooq end-of-day market data",
      url: `https://stooq.com/q/d/l/?s=${encodeURIComponent(mapStooqSymbol(company)?.symbol ?? company.ticker.toLowerCase())}&i=d`,
      freshness: "End-of-day market data, cached up to 15 minutes.",
    };
  },
  fetchMarketData: fetchStooqMarketData,
};
