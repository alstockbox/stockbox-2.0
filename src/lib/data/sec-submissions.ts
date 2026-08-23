import type { CompanySearchResult, ResearchEvent, ResearchEventCategory, ResearchLayerPayload } from "@/lib/analysis/types";
import { getSecUserAgent } from "@/lib/env/server";
import { padCik } from "./sec";
import { providerDiagnostic, type AdapterResult, type FilingsEventsProvider } from "./providers";

const PROVIDER_ID = "sec-submissions";
const SEC_FORMS = new Set<ResearchEvent["form"]>(["10-K", "10-Q", "8-K", "6-K", "20-F"]);
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

type RecentFilings = {
  accessionNumber?: unknown[];
  filingDate?: unknown[];
  form?: unknown[];
  primaryDocument?: unknown[];
  items?: unknown[];
};

export type SecSubmissionsPayload = {
  cik?: string;
  filings?: { recent?: RecentFilings };
};

function stringAt(values: unknown[] | undefined, index: number): string | null {
  const value = values?.[index];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function itemCodes(value: string | null): string[] {
  return value?.split(",").map((item) => item.trim()).filter((item) => /^\d+\.\d+$/.test(item)) ?? [];
}

export function classifySecEvent(form: ResearchEvent["form"], items: string[]): ResearchEventCategory {
  if (["10-K", "10-Q", "20-F"].includes(form)) return "earnings_results";
  if (form !== "8-K") return "other_material_event";
  if (items.includes("2.02")) return "earnings_results";
  if (items.includes("2.01")) return "acquisition_disposition";
  if (items.some((item) => ["2.03", "3.02"].includes(item))) return "financing_capital";
  if (items.includes("5.02")) return "management_governance";
  if (items.some((item) => ["2.05", "2.06"].includes(item))) return "impairment_restructuring";
  if (items.includes("1.01")) return "material_agreement";
  return "other_material_event";
}

export function parseSecSubmissionEvents(payload: SecSubmissionsPayload, requestedCik?: string, limit = 20): ResearchEvent[] {
  const recent = payload.filings?.recent;
  const cik = padCik(payload.cik ?? requestedCik ?? "");
  const length = Math.max(recent?.accessionNumber?.length ?? 0, recent?.form?.length ?? 0);
  const events: ResearchEvent[] = [];
  for (let index = 0; index < length && events.length < limit; index += 1) {
    const formValue = stringAt(recent?.form, index);
    if (!formValue || !SEC_FORMS.has(formValue as ResearchEvent["form"])) continue;
    const form = formValue as ResearchEvent["form"];
    const filingDate = stringAt(recent?.filingDate, index);
    const accession = stringAt(recent?.accessionNumber, index);
    if (!filingDate || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate) || !accession) continue;
    const primaryDocument = stringAt(recent?.primaryDocument, index);
    const items = itemCodes(stringAt(recent?.items, index));
    const accessionPath = accession.replace(/-/g, "");
    const documentPath = primaryDocument ? `/${encodeURIComponent(primaryDocument)}` : "";
    events.push({
      category: classifySecEvent(form, items),
      form,
      filingDate,
      accession,
      primaryDocument,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}${documentPath}`,
      items,
      source: "SEC EDGAR submissions metadata",
      provider: PROVIDER_ID,
    });
  }
  return events;
}

function failure(reason: "not_configured" | "unsupported_symbol" | "upstream_error"): AdapterResult<ResearchLayerPayload<ResearchEvent[]>> {
  const message = reason === "not_configured" ? "SEC contact is not configured."
    : reason === "unsupported_symbol" ? "A SEC CIK is required for filing research."
    : "SEC submissions could not be retrieved.";
  return { ok: false, reason, message, diagnostic: providerDiagnostic("SEC Submissions", "filings_events", reason === "unsupported_symbol" ? "unsupported" : "unavailable", reason) };
}

export async function fetchSecSubmissionEvents(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload<ResearchEvent[]>>> {
  const userAgent = getSecUserAgent();
  if (!userAgent) return failure("not_configured");
  if (!company.cik) return failure("unsupported_symbol");
  const cik = padCik(company.cik);
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent, Accept: "application/json", "Accept-Encoding": "gzip, deflate" },
        signal: controller.signal,
        next: { revalidate: 60 * 60 },
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        console.error("SEC submissions research request failed", {
          status: response.status,
          endpoint: `/submissions/CIK${cik}.json`,
          attempt,
        });
        if (retryable && attempt < MAX_ATTEMPTS) continue;
        return failure("upstream_error");
      }
      const payload = await response.json() as SecSubmissionsPayload;
      const events = parseSecSubmissionEvents(payload, cik);
      const observedAt = new Date().toISOString();
      return {
        ok: true,
        data: {
          data: events,
          dataAsOf: events[0]?.filingDate ?? null,
          coverage: 1,
          confidence: 95,
          evidence: [{
            id: `sec-submissions-${cik}`,
            kind: "reported_fact",
            sourceTier: "regulatory_filing",
            title: "SEC submissions metadata",
            source: { name: "SEC EDGAR submissions", url, accessedAt: observedAt, freshness: "Cached for one hour." },
            dataAsOf: events[0]?.filingDate ?? null,
          }],
        },
        diagnostic: providerDiagnostic("SEC Submissions", "filings_events", "available"),
      };
    } catch (error) {
      console.error("SEC submissions research request failed", {
        reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
        endpoint: `/submissions/CIK${cik}.json`,
        attempt,
      });
      if (attempt === MAX_ATTEMPTS) return failure("upstream_error");
    } finally {
      clearTimeout(timeout);
    }
  }
  return failure("upstream_error");
}

export const secFilingsEventsProvider: FilingsEventsProvider = {
  id: PROVIDER_ID,
  fetchFilingsEvents: fetchSecSubmissionEvents,
};
