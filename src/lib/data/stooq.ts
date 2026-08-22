import type { CompanySearchResult, MarketSnapshot } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult, type MarketDataProvider, type ProviderCapabilities, type ProviderFailureReason } from "./providers";

type PriceRow = { date: string; close: number; volume: number | null };
type StooqSymbol = { symbol: string; currency: string | null };

const STOOQ_TIMEOUT_MS = 8_000;
const STOOQ_RETRIES = 2;
const US_EXCHANGES = new Set(["US", "NYSE", "NASDAQ", "NYSE AMERICAN", "AMEX"]);

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

export function parseStooqCsv(csv: string): PriceRow[] | null {
  const body = csv.trim();
  if (!body || /\bN\/D\b/i.test(body) || /exceeded|rate.?limit/i.test(body)) return null;
  const [header, ...lines] = body.split(/\r?\n/);
  const columns = header?.split(",").map((item) => item.trim().toLowerCase()) ?? [];
  const expected = ["date", "open", "high", "low", "close", "volume"];
  if (columns.length < expected.length || expected.some((column, index) => columns[index] !== column)) return null;
  const rows = lines.map((line) => line.split(",")).map(([date, , , , close, volume]) => ({
    date: date?.trim(),
    close: Number(close),
    volume: volume && volume !== "N/D" ? Number(volume) : null,
  }));
  if (rows.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(row.close) || row.close <= 0 || (row.volume !== null && !Number.isFinite(row.volume)))) return null;
  return rows;
}

function performance(rows: PriceRow[], tradingDays: number): number | null {
  const latest = rows.at(-1);
  const prior = rows.at(Math.max(0, rows.length - 1 - tradingDays));
  return latest && prior && prior.close > 0 ? latest.close / prior.close - 1 : null;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function failure(reason: ProviderFailureReason, message: string): AdapterResult<MarketSnapshot> {
  return { ok: false, reason, message, diagnostic: providerDiagnostic("Stooq", "market_data", reason === "unsupported_symbol" ? "unsupported" : "unavailable", reason) };
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
      if (!response.ok) {
        lastReason = response.status === 429 ? "rate_limited" : response.status >= 500 ? "upstream_error" : "not_found";
        if (response.status < 500 && response.status !== 429) return failure(lastReason, "Stooq did not return market history for this symbol.");
      } else {
        const body = await response.text();
        if (!body.trim()) return failure("empty_response", "Stooq returned an empty response.");
        if (/exceeded|rate.?limit/i.test(body)) lastReason = "rate_limited";
        else if (/\bN\/D\b/i.test(body)) return failure("not_found", "Stooq reported no data for this symbol.");
        else {
          const rows = parseStooqCsv(body);
          if (!rows?.length) return failure("malformed_response", "Stooq returned malformed market data.");
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
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < retries) await delay(150 * 2 ** attempt);
  }
  console.error("Stooq provider request failed", { symbol: mapped.symbol, reason: lastReason });
  return failure(lastReason, lastReason === "timeout" ? "Stooq request timed out." : "Stooq market data is temporarily unavailable.");
}

export async function fetchMarketSnapshot(company: CompanySearchResult | string): Promise<MarketSnapshot | null> {
  const normalized = typeof company === "string" ? { ticker: company, name: company } : company;
  const result = await fetchStooqMarketData(normalized);
  return result.ok ? result.data : null;
}

export const stooqMarketDataProvider: MarketDataProvider = {
  id: "stooq-eod",
  capabilities: STOOQ_CAPABILITIES,
  fetchMarketData: fetchStooqMarketData,
};
