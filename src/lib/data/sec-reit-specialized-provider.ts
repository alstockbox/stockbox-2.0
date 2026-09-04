import type {
  CompanySearchResult,
  ReitSpecializedMetrics,
  SpecializedMetric,
} from "@/lib/analysis/types";
import { getSecUserAgent } from "@/lib/env/server";
import { providerDiagnostic, type AdapterResult, type ProviderFailureReason } from "./providers";
import {
  parseSecReitSpecializedDocument,
  type SecReitMetricKey,
  type SecReitObservation,
} from "./sec-reit-specialized";

const PROVIDER_ID = "sec-reit-filings";
const PROVIDER_NAME = "SEC REIT filings";
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 2;
const MAX_EXHIBITS = 3;

type RecentFilings = {
  accessionNumber?: unknown[];
  filingDate?: unknown[];
  form?: unknown[];
  items?: unknown[];
};

type SecSubmissionsPayload = {
  cik?: string;
  filings?: { recent?: RecentFilings };
};

type EarningsFiling = {
  cik: string;
  accession: string;
  filingDate: string;
};

type RequestResult =
  | { ok: true; response: Response }
  | { ok: false; reason: ProviderFailureReason; diagnosticReason?: string };

function padCik(value: string): string {
  return value.replace(/\D/g, "").padStart(10, "0");
}

function stringAt(values: unknown[] | undefined, index: number): string | null {
  const value = values?.[index];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function failure(
  reason: ProviderFailureReason,
  diagnosticReason: string = reason,
): AdapterResult<ReitSpecializedMetrics> {
  const message = reason === "not_configured"
    ? "SEC contact is not configured."
    : reason === "unsupported_symbol"
      ? "A SEC CIK is required for REIT specialized data."
      : reason === "empty_response"
        ? "No period-safe REIT specialist facts were found in the latest SEC earnings exhibits."
        : reason === "rate_limited"
          ? "SEC rate limited the REIT specialized-data request."
          : reason === "timeout"
            ? "SEC REIT specialized-data request timed out."
            : "SEC REIT specialized data could not be retrieved.";
  return {
    ok: false,
    reason,
    message,
    diagnostic: providerDiagnostic(
      PROVIDER_NAME,
      "specialized",
      reason === "unsupported_symbol" ? "unsupported" : "unavailable",
      diagnosticReason,
    ),
  };
}

async function secRequest(url: string, userAgent: string, accept: string): Promise<RequestResult> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: accept,
          "Accept-Encoding": "gzip, deflate",
        },
        signal: controller.signal,
        next: { revalidate: 60 * 60 },
      });
      if (response.ok) return { ok: true, response };
      if (response.status === 429) {
        if (attempt < MAX_ATTEMPTS) continue;
        return { ok: false, reason: "rate_limited", diagnosticReason: "rate_limited" };
      }
      if (response.status >= 500 && attempt < MAX_ATTEMPTS) continue;
      return {
        ok: false,
        reason: "upstream_error",
        diagnosticReason: `http_${response.status}`,
      };
    } catch (error) {
      const timeoutFailure = error instanceof Error && error.name === "AbortError";
      if (attempt < MAX_ATTEMPTS) continue;
      return { ok: false, reason: timeoutFailure ? "timeout" : "upstream_error" };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, reason: "upstream_error" };
}

function latestEarnings8K(payload: SecSubmissionsPayload, requestedCik: string): EarningsFiling | null {
  const recent = payload.filings?.recent;
  const length = Math.max(
    recent?.accessionNumber?.length ?? 0,
    recent?.filingDate?.length ?? 0,
    recent?.form?.length ?? 0,
    recent?.items?.length ?? 0,
  );
  const candidates: EarningsFiling[] = [];
  for (let index = 0; index < length; index += 1) {
    if (stringAt(recent?.form, index) !== "8-K") continue;
    const items = stringAt(recent?.items, index)?.split(",").map((item) => item.trim()) ?? [];
    if (!items.includes("2.02")) continue;
    const accession = stringAt(recent?.accessionNumber, index);
    const filingDate = stringAt(recent?.filingDate, index);
    if (!accession || !filingDate || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) continue;
    candidates.push({
      cik: padCik(payload.cik ?? requestedCik),
      accession,
      filingDate,
    });
  }
  return candidates.sort((left, right) => right.filingDate.localeCompare(left.filingDate))[0] ?? null;
}

function filingDirectory(filing: EarningsFiling): string {
  const numericCik = String(Number(filing.cik));
  return `https://www.sec.gov/Archives/edgar/data/${numericCik}/${filing.accession.replace(/-/g, "")}/`;
}

function filingIndexUrl(filing: EarningsFiling): string {
  return `${filingDirectory(filing)}${filing.accession}-index.htm`;
}

function periodOfReport(indexHtml: string): string | null {
  const match = indexHtml.match(/Period\s+of\s+Report[\s\S]{0,320}?(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function secExhibitUrls(indexHtml: string, filing: EarningsFiling): string[] {
  const base = filingDirectory(filing);
  const urls = new Set<string>();
  for (const row of indexHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    if (!/EX-99\.(?:1|2)\b/i.test(row)) continue;
    const href = row.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const resolved = new URL(href, base);
      if (resolved.protocol !== "https:") continue;
      if (resolved.hostname !== "www.sec.gov" && resolved.hostname !== "sec.gov") continue;
      if (!resolved.pathname.startsWith(new URL(base).pathname)) continue;
      urls.add(resolved.toString());
    } catch {
      continue;
    }
    if (urls.size >= MAX_EXHIBITS) break;
  }
  return [...urls];
}

function emptyMetric(definition?: string): SpecializedMetric {
  return { value: null, ...(definition ? { definition } : {}) };
}

function observationMetric(observation: SecReitObservation, filing: EarningsFiling): SpecializedMetric {
  return {
    value: observation.value,
    unit: observation.unit,
    dataAsOf: observation.dataAsOf,
    definition: observation.label,
    provenance: {
      source: "SEC EDGAR earnings exhibit",
      provider: PROVIDER_ID,
      valueKind: "reported",
      periodEnd: observation.dataAsOf ?? undefined,
      filedAt: filing.filingDate,
      form: "8-K",
      accession: filing.accession,
      note: observation.sourceUrl,
    },
  };
}

function buildReitMetrics(
  observations: Map<SecReitMetricKey, SecReitObservation>,
  filing: EarningsFiling,
): ReitSpecializedMetrics {
  const metric = (key: SecReitMetricKey) => {
    const observation = observations.get(key);
    return observation ? observationMetric(observation, filing) : emptyMetric();
  };
  return {
    kind: "reit",
    fundsFromOperations: emptyMetric("FFO is not inferred from generic GAAP or non-GAAP values."),
    fundsFromOperationsPerShare: emptyMetric("FFO per share is not inferred unless explicitly period-safe."),
    adjustedFundsFromOperations: {
      ...emptyMetric("AFFO is company-defined and is not inferred from generic cash-flow values."),
      companyDefined: true,
    },
    adjustedFundsFromOperationsPerShare: {
      ...emptyMetric("AFFO per share is company-defined and is not inferred unless explicitly period-safe."),
      companyDefined: true,
    },
    fundsFromOperationsGrowth: emptyMetric(),
    adjustedFundsFromOperationsGrowth: emptyMetric(),
    adjustedFundsFromOperationsPayout: emptyMetric(),
    dividendCoverage: emptyMetric(),
    occupancy: metric("occupancy"),
    sameStoreNoiGrowth: metric("sameStoreNoiGrowth"),
    netDebtToEbitdare: metric("netDebtToEbitdare"),
    debtMaturities: emptyMetric(),
    fixedChargeCoverage: metric("fixedChargeCoverage"),
    netAssetValue: emptyMetric(),
  };
}

export async function fetchSecReitSpecializedData(
  company: CompanySearchResult,
): Promise<AdapterResult<ReitSpecializedMetrics>> {
  const userAgent = getSecUserAgent();
  if (!userAgent) return failure("not_configured");
  if (!company.cik) return failure("unsupported_symbol");

  const cik = padCik(company.cik);
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const submissionsResponse = await secRequest(submissionsUrl, userAgent, "application/json");
  if (!submissionsResponse.ok) return failure(submissionsResponse.reason, submissionsResponse.diagnosticReason);

  let payload: SecSubmissionsPayload;
  try {
    payload = await submissionsResponse.response.json() as SecSubmissionsPayload;
  } catch {
    return failure("upstream_error");
  }
  const filing = latestEarnings8K(payload, cik);
  if (!filing) return failure("empty_response");

  const indexResponse = await secRequest(filingIndexUrl(filing), userAgent, "text/html,application/xhtml+xml");
  if (!indexResponse.ok) return failure(indexResponse.reason, indexResponse.diagnosticReason);
  const indexHtml = await indexResponse.response.text();
  const periodEnd = periodOfReport(indexHtml);
  if (!periodEnd) return failure("empty_response");

  const exhibitUrls = secExhibitUrls(indexHtml, filing);
  if (!exhibitUrls.length) return failure("empty_response");

  const observations = new Map<SecReitMetricKey, SecReitObservation>();
  let lastExhibitFailure: Extract<RequestResult, { ok: false }> | null = null;
  for (const url of exhibitUrls) {
    const exhibitResponse = await secRequest(url, userAgent, "text/html,application/xhtml+xml");
    if (!exhibitResponse.ok) {
      lastExhibitFailure = exhibitResponse;
      continue;
    }
    const html = await exhibitResponse.response.text();
    for (const observation of parseSecReitSpecializedDocument(html, { sourceUrl: url, periodEnd })) {
      if (!observations.has(observation.metric)) observations.set(observation.metric, observation);
    }
  }
  if (!observations.size && lastExhibitFailure) {
    return failure(lastExhibitFailure.reason, lastExhibitFailure.diagnosticReason);
  }
  if (!observations.size) return failure("empty_response");

  return {
    ok: true,
    data: buildReitMetrics(observations, filing),
    diagnostic: providerDiagnostic(PROVIDER_NAME, "specialized", "available"),
  };
}
