import type { CompanySearchResult, ResearchLayerPayload } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult } from "./providers";

export type RiksbankRiskFreeSeries = {
  seriesId: string;
  label: string;
  currency: string;
};

export type RiksbankMacroData = {
  currency: string;
  seriesId: string;
  seriesLabel: string;
  observedYieldPercent: number;
  riskFreeRate: number;
  observationDate: string;
};

const RISK_FREE_SERIES: Record<string, RiksbankRiskFreeSeries> = {
  SEK: { currency: "SEK", seriesId: "SEGVB10YC", label: "Swedish Government Bond 10Y" },
  USD: { currency: "USD", seriesId: "USGVB10Y", label: "US Government Bond 10Y" },
  EUR: { currency: "EUR", seriesId: "EMGVB10Y", label: "Euro-area Government Bond 10Y" },
  GBP: { currency: "GBP", seriesId: "GBGVB10Y", label: "UK Government Bond 10Y" },
  NOK: { currency: "NOK", seriesId: "NOGVB10Y", label: "Norwegian Government Bond 10Y" },
  DKK: { currency: "DKK", seriesId: "DKGVB10Y", label: "Danish Government Bond 10Y" },
  JPY: { currency: "JPY", seriesId: "JPGVB10Y", label: "Japanese Government Bond 10Y" },
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const latestObservationCache = new Map<string, { expiresAt: number; observation: { date: string; value: number } }>();

export function riskFreeSeriesForCurrency(currency: string | null | undefined): RiksbankRiskFreeSeries | null {
  const normalized = currency?.trim().toUpperCase();
  return normalized ? RISK_FREE_SERIES[normalized] ?? null : null;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

export function parseRiksbankLatestObservation(payload: unknown): { date: string; value: number } | null {
  const visit = (value: unknown): { date: string; value: number } | null => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const observedValue = numeric(record.value ?? record.Value ?? record.observationValue ?? record.ObservationValue);
    const observedDate = dateValue(record.date ?? record.Date ?? record.observationDate ?? record.ObservationDate);
    if (observedValue !== null && observedDate) return { date: observedDate, value: observedValue };
    for (const nested of Object.values(record)) {
      const found = visit(nested);
      if (found) return found;
    }
    return null;
  };
  return visit(payload);
}

function success(series: RiksbankRiskFreeSeries, endpoint: string, observation: { date: string; value: number }): AdapterResult<ResearchLayerPayload<RiksbankMacroData>> {
  const accessedAt = new Date().toISOString();
  const source = {
    name: `Sveriges Riksbank — ${series.label}`,
    url: endpoint,
    accessedAt,
    freshness: "Latest published official observation from the Riksbank SWEA API; StockBox caches the observation for up to six hours to respect public API limits.",
    provider: "riksbank-swea",
    capability: "macro" as const,
    dataAsOf: observation.date,
    version: "riksbank-swea-adapter-v1",
  };
  return {
    ok: true,
    data: {
      data: {
        currency: series.currency,
        seriesId: series.seriesId,
        seriesLabel: series.label,
        observedYieldPercent: observation.value,
        riskFreeRate: observation.value / 100,
        observationDate: observation.date,
      },
      dataAsOf: observation.date,
      coverage: 1,
      confidence: 95,
      evidence: [{ id: `riksbank-${series.seriesId}-${observation.date}`, kind: "reported_fact", sourceTier: "official_regulator", title: series.label, source, dataAsOf: observation.date }],
    },
    diagnostic: providerDiagnostic("riksbank-swea", "macro", "available"),
  };
}

export async function fetchRiksbankMacroContext(
  company: Pick<CompanySearchResult, "currency">,
  options: { apiKey?: string | null; fetcher?: typeof fetch } = {},
): Promise<AdapterResult<ResearchLayerPayload<RiksbankMacroData>>> {
  const series = riskFreeSeriesForCurrency(company.currency);
  if (!series) {
    return {
      ok: false,
      reason: "unsupported_symbol",
      message: `No StockBox-approved Riksbank 10-year benchmark is configured for ${company.currency ?? "the unknown currency"}.`,
      diagnostic: providerDiagnostic("riksbank-swea", "macro", "unsupported", "unsupported_currency"),
    };
  }

  const endpoint = `https://api.riksbank.se/swea/v1/Observations/Latest/${encodeURIComponent(series.seriesId)}`;
  if (!options.fetcher) {
    const cached = latestObservationCache.get(series.seriesId);
    if (cached && cached.expiresAt > Date.now()) return success(series, endpoint, cached.observation);
  }

  const fetcher = options.fetcher ?? fetch;
  const headers: HeadersInit = { Accept: "application/json" };
  if (options.apiKey?.trim()) headers["Ocp-Apim-Subscription-Key"] = options.apiKey.trim();

  try {
    const response = await fetcher(endpoint, { headers, signal: AbortSignal.timeout(6_000) });
    if (response.status === 429) {
      return { ok: false, reason: "rate_limited", message: "Riksbank API rate limit reached.", diagnostic: providerDiagnostic("riksbank-swea", "macro", "unavailable", "rate_limited") };
    }
    if (!response.ok) {
      return { ok: false, reason: "upstream_error", message: `Riksbank API returned HTTP ${response.status}.`, diagnostic: providerDiagnostic("riksbank-swea", "macro", "unavailable", `http_${response.status}`) };
    }
    const observation = parseRiksbankLatestObservation(await response.json());
    if (!observation) {
      return { ok: false, reason: "empty_response", message: "Riksbank returned no usable observation.", diagnostic: providerDiagnostic("riksbank-swea", "macro", "unavailable", "empty_observation") };
    }
    if (!options.fetcher) latestObservationCache.set(series.seriesId, { expiresAt: Date.now() + CACHE_TTL_MS, observation });
    return success(series, endpoint, observation);
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "upstream_error";
    return { ok: false, reason, message: "Riksbank API request failed.", diagnostic: providerDiagnostic("riksbank-swea", "macro", "unavailable", reason) };
  }
}
