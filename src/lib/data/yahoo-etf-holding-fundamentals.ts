import type {
  AnalysisSource,
  ProviderDiagnostic,
} from "@/lib/analysis/types";
import type { EtfHolding } from "@/lib/analysis/universal-security";
import type { EtfHoldingFundamentalData } from "./etf-look-through-enrichment";
import { providerDiagnostic } from "./providers";

const PROVIDER_NAME = "Yahoo Finance ETF holding fundamentals";
const SOURCE_PROVIDER = "Yahoo Finance";
const PROVIDER_VERSION = "yahoo-etf-holding-fundamentals-v2";
const REQUEST_TIMEOUT_MS = 10_000;
const SUCCESS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MODULES = "financialData,defaultKeyStatistics,summaryDetail,assetProfile";
const HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
] as const;

type JsonObject = Record<string, unknown>;

export type YahooEtfHoldingFundamentalsResult =
  | {
      ok: true;
      data: EtfHoldingFundamentalData;
      diagnostic: ProviderDiagnostic;
      source: AnalysisSource;
    }
  | {
      ok: false;
      message: string;
      diagnostic: ProviderDiagnostic;
    };

type YahooEtfHoldingFundamentalsSuccess = Extract<
  YahooEtfHoldingFundamentalsResult,
  { ok: true }
>;

type SuccessCacheEntry = {
  expiresAt: number;
  result: YahooEtfHoldingFundamentalsSuccess;
};

const successCache = new Map<string, SuccessCacheEntry>();

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const wrapped = object(value);
  const raw = wrapped?.raw;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

function quoteSummaryResult(payload: unknown): JsonObject | null {
  const root = object(payload);
  const quoteSummary = object(root?.quoteSummary);
  const results = Array.isArray(quoteSummary?.result) ? quoteSummary.result : [];
  return object(results[0]);
}

function parseVerifiedFields(result: JsonObject): EtfHoldingFundamentalData {
  const financialData = object(result.financialData);
  const defaultKeyStatistics = object(result.defaultKeyStatistics);
  const summaryDetail = object(result.summaryDetail);
  const assetProfile = object(result.assetProfile);

  return {
    revenueGrowth: numberValue(financialData?.revenueGrowth),
    epsGrowth: numberValue(financialData?.earningsGrowth),
    operatingMargin: numberValue(financialData?.operatingMargins),
    forwardPe: numberValue(defaultKeyStatistics?.forwardPE)
      ?? numberValue(summaryDetail?.forwardPE),
    priceBook: numberValue(defaultKeyStatistics?.priceToBook)
      ?? numberValue(summaryDetail?.priceToBook),
    dividendYield: numberValue(summaryDetail?.dividendYield),
    sector: stringValue(assetProfile?.sector),
    country: stringValue(assetProfile?.country),
  };
}

function hasVerifiedField(data: EtfHoldingFundamentalData): boolean {
  return Object.values(data).some((value) => value !== undefined && value !== null);
}

function unavailable(reason: string, message: string): YahooEtfHoldingFundamentalsResult {
  return {
    ok: false,
    message,
    diagnostic: providerDiagnostic(PROVIDER_NAME, "specialized", "unavailable", reason),
  };
}

function requestUrl(host: string, ticker: string): string {
  return `${host}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${MODULES}`;
}

function readCachedSuccess(cacheKey: string): YahooEtfHoldingFundamentalsSuccess | null {
  const cached = successCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    successCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

export async function fetchYahooEtfHoldingFundamentals(
  holding: EtfHolding,
): Promise<YahooEtfHoldingFundamentalsResult> {
  const ticker = typeof holding.ticker === "string" ? holding.ticker.trim() : "";
  if (!ticker) {
    return unavailable("missing_ticker", "ETF holding has no explicit ticker for Yahoo look-through enrichment.");
  }

  const cacheKey = ticker.toUpperCase();
  const cached = readCachedSuccess(cacheKey);
  if (cached) return cached;

  let sawValidYahooPayload = false;

  for (const host of HOSTS) {
    const url = requestUrl(host, ticker);
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: "application/json",
          "User-Agent": "StockBox/2.0 ETF look-through",
        },
      });
      if (!response.ok) continue;

      const result = quoteSummaryResult(await response.json());
      if (!result) continue;
      sawValidYahooPayload = true;

      const data = parseVerifiedFields(result);
      if (!hasVerifiedField(data)) continue;

      const accessedAt = new Date().toISOString();
      const success: YahooEtfHoldingFundamentalsSuccess = {
        ok: true,
        data,
        diagnostic: providerDiagnostic(PROVIDER_NAME, "specialized", "available"),
        source: {
          name: "Yahoo Finance holding fundamentals",
          url,
          accessedAt,
          freshness: "Latest quoteSummary snapshot",
          provider: SOURCE_PROVIDER,
          capability: "specialized",
          version: PROVIDER_VERSION,
        },
      };
      successCache.set(cacheKey, {
        expiresAt: Date.now() + SUCCESS_CACHE_TTL_MS,
        result: success,
      });
      return success;
    } catch {
      // Try the alternate Yahoo host. If both fail, the adapter fails closed below.
    }
  }

  if (sawValidYahooPayload) {
    return unavailable(
      "no_verified_holding_fields",
      "Yahoo returned no semantically safe holding fundamentals for look-through enrichment.",
    );
  }

  return unavailable(
    "upstream_unavailable",
    "Yahoo holding fundamentals were unavailable from both quoteSummary hosts.",
  );
}
