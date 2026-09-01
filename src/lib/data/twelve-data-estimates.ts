import type { CompanySearchResult, ForwardEstimates } from "@/lib/analysis/types";
import {
  providerDiagnostic,
  type AdapterResult,
  type ProviderFailureReason,
} from "./providers";

const PROVIDER_NAME = "Twelve Data analyst estimates";
const BASE_URL = "https://api.twelvedata.com";
const REQUEST_TIMEOUT_MS = 10_000;

export type EstimatePeriod = "current_quarter" | "next_quarter" | "current_year" | "next_year";

export type TwelveDataConsensusEstimate = {
  date: string | null;
  period: EstimatePeriod;
  analystCount: number | null;
  average: number | null;
  low: number | null;
  high: number | null;
};

export type TwelveDataEpsRevision = {
  date: string | null;
  period: EstimatePeriod;
  upLastWeek: number;
  upLastMonth: number;
  downLastWeek: number;
  downLastMonth: number;
  netLastWeek: number;
  netLastMonth: number;
};

export type TwelveDataEstimateSnapshot = {
  forwardEstimates: ForwardEstimates;
  earningsConsensus: TwelveDataConsensusEstimate[];
  revenueConsensus: TwelveDataConsensusEstimate[];
  epsRevisions: TwelveDataEpsRevision[];
  currency: string | null;
  coverage: number;
};

type JsonObject = Record<string, unknown>;

type EndpointResult = AdapterResult<JsonObject>;

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

function nonNegativeInteger(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed !== null && parsed >= 0 && Number.isInteger(parsed) ? parsed : null;
}

function periodValue(value: unknown): EstimatePeriod | null {
  return ["current_quarter", "next_quarter", "current_year", "next_year"].includes(String(value))
    ? value as EstimatePeriod
    : null;
}

function dateValue(value: unknown): string | null {
  const date = textValue(value)?.slice(0, 10) ?? null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) ? date : null;
}

function failure<T>(reason: ProviderFailureReason, message: string): AdapterResult<T> {
  return {
    ok: false,
    reason,
    message,
    diagnostic: providerDiagnostic(PROVIDER_NAME, "estimates", "unavailable", reason),
  };
}

async function request(path: string, symbol: string, apiKey: string): Promise<EndpointResult> {
  if (!apiKey.trim()) return failure("not_configured", "Twelve Data analyst estimates are not configured.");
  const url = new URL(path, BASE_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, next: { revalidate: 60 * 30 } });
    if (!response.ok) {
      return failure(
        response.status === 429 ? "rate_limited" : response.status === 404 ? "not_found" : "upstream_error",
        `Twelve Data ${path} request failed.`,
      );
    }
    const payload = object(await response.json());
    if (!payload) return failure("empty_response", `Twelve Data ${path} returned an empty response.`);
    if (payload.status === "error") {
      const code = numberValue(payload.code);
      return failure(
        code === 429 ? "rate_limited" : code === 404 ? "not_found" : "upstream_error",
        textValue(payload.message) ?? `Twelve Data ${path} rejected the request.`,
      );
    }
    return {
      ok: true,
      data: payload,
      diagnostic: providerDiagnostic(PROVIDER_NAME, "estimates", "available"),
    };
  } catch (error) {
    const timeoutError = error instanceof Error && error.name === "AbortError";
    return failure(
      timeoutError ? "timeout" : error instanceof SyntaxError ? "empty_response" : "upstream_error",
      timeoutError ? `Twelve Data ${path} timed out.` : `Twelve Data ${path} could not be reached.`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function consensusRows(payload: JsonObject, key: "earnings_estimate" | "revenue_estimate"): TwelveDataConsensusEstimate[] {
  const values = payload[key];
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const item = object(value);
    const period = periodValue(item?.period);
    if (!period) return [];
    return [{
      date: dateValue(item?.date),
      period,
      analystCount: nonNegativeInteger(item?.number_of_analysts),
      average: numberValue(item?.avg_estimate),
      low: numberValue(item?.low_estimate),
      high: numberValue(item?.high_estimate),
    }];
  });
}

function revisionRows(payload: JsonObject): TwelveDataEpsRevision[] {
  if (!Array.isArray(payload.eps_revision)) return [];
  return payload.eps_revision.flatMap((value) => {
    const item = object(value);
    const period = periodValue(item?.period);
    const upLastWeek = nonNegativeInteger(item?.up_last_week);
    const upLastMonth = nonNegativeInteger(item?.up_last_month);
    const downLastWeek = nonNegativeInteger(item?.down_last_week);
    const downLastMonth = nonNegativeInteger(item?.down_last_month);
    if (!period || upLastWeek === null || upLastMonth === null || downLastWeek === null || downLastMonth === null) return [];
    return [{
      date: dateValue(item?.date),
      period,
      upLastWeek,
      upLastMonth,
      downLastWeek,
      downLastMonth,
      netLastWeek: upLastWeek - downLastWeek,
      netLastMonth: upLastMonth - downLastMonth,
    }];
  });
}

function periodEstimate(rows: TwelveDataConsensusEstimate[], period: EstimatePeriod): number | null {
  return rows.find((row) => row.period === period)?.average ?? null;
}

function meaningfulForwardGrowth(current: number | null, next: number | null): number | null {
  if (current === null || next === null || current <= 0 || next <= 0) return null;
  return next / current - 1;
}

function currencyFrom(...payloads: JsonObject[]): string | null {
  for (const payload of payloads) {
    const currency = textValue(object(payload.meta)?.currency);
    if (currency) return currency.toUpperCase();
  }
  return null;
}

function endpointCoverage(results: EndpointResult[]): number {
  return results.filter((result) => result.ok).length / results.length;
}

export async function fetchTwelveDataEstimateSnapshot(
  company: CompanySearchResult,
  apiKey: string,
): Promise<AdapterResult<TwelveDataEstimateSnapshot>> {
  if (!apiKey.trim()) return failure("not_configured", "Twelve Data analyst estimates are not configured.");
  const symbol = company.canonicalTicker ?? company.ticker;
  const [earningsResult, revenueResult, revisionsResult] = await Promise.all([
    request("/earnings_estimate", symbol, apiKey),
    request("/revenue_estimate", symbol, apiKey),
    request("/eps_revisions", symbol, apiKey),
  ]);
  const results = [earningsResult, revenueResult, revisionsResult];
  if (results.every((result) => !result.ok)) {
    const first = results.find((result) => !result.ok);
    return first && !first.ok
      ? failure(first.reason, first.message)
      : failure("empty_response", "Twelve Data returned no analyst estimates.");
  }

  const earningsPayload = earningsResult.ok ? earningsResult.data : {};
  const revenuePayload = revenueResult.ok ? revenueResult.data : {};
  const revisionsPayload = revisionsResult.ok ? revisionsResult.data : {};
  const earningsConsensus = consensusRows(earningsPayload, "earnings_estimate");
  const revenueConsensus = consensusRows(revenuePayload, "revenue_estimate");
  const epsRevisions = revisionRows(revisionsPayload);
  const nextYearEpsGrowth = meaningfulForwardGrowth(
    periodEstimate(earningsConsensus, "current_year"),
    periodEstimate(earningsConsensus, "next_year"),
  );
  const nextYearRevenueGrowth = meaningfulForwardGrowth(
    periodEstimate(revenueConsensus, "current_year"),
    periodEstimate(revenueConsensus, "next_year"),
  );
  const coverage = endpointCoverage(results);
  const hasAnyUsableData = earningsConsensus.length > 0 || revenueConsensus.length > 0 || epsRevisions.length > 0;
  if (!hasAnyUsableData) return failure("empty_response", "Twelve Data returned no usable analyst estimates.");

  return {
    ok: true,
    data: {
      forwardEstimates: {
        nextYearRevenueGrowth,
        nextYearEpsGrowth,
        nextYearFreeCashFlowGrowth: null,
      },
      earningsConsensus,
      revenueConsensus,
      epsRevisions,
      currency: currencyFrom(earningsPayload, revenuePayload, revisionsPayload),
      coverage,
    },
    diagnostic: providerDiagnostic(
      PROVIDER_NAME,
      "estimates",
      coverage === 1 ? "available" : "partial",
      coverage === 1 ? undefined : "one_or_more_estimate_endpoints_unavailable",
    ),
  };
}
