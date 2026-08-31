import type { ResearchEvidence, ResearchLayerPayload } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult } from "./providers";

export type BolagsverketDocument = {
  documentId: string;
  fileFormat: string | null;
  reportingPeriodEnd: string | null;
  registeredAt: string | null;
};

export type BolagsverketCredentials = {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  baseUrl: string;
  scope?: string | null;
};

export type BolagsverketFilingsData = {
  organizationNumber: string;
  documents: BolagsverketDocument[];
};

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function parseBolagsverketDocumentList(payload: unknown): BolagsverketDocument[] {
  if (!payload || typeof payload !== "object") return [];
  const documents = (payload as Record<string, unknown>).dokument;
  if (!Array.isArray(documents)) return [];
  return documents.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const documentId = readString(record, "dokumentId", "dokumentid", "documentId");
    if (!documentId) return [];
    return [{
      documentId,
      fileFormat: readString(record, "filformat", "fileFormat"),
      reportingPeriodEnd: readString(record, "rapporteringsperiodTom", "rapporteringsperiodtom", "reportingPeriodEnd"),
      registeredAt: readString(record, "registreringstidpunkt", "registeredAt"),
    }];
  }).sort((left, right) => (right.reportingPeriodEnd ?? right.registeredAt ?? "").localeCompare(left.reportingPeriodEnd ?? left.registeredAt ?? ""));
}

async function getToken(credentials: BolagsverketCredentials, fetcher: typeof fetch): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  if (credentials.scope?.trim()) body.set("scope", credentials.scope.trim());
  const response = await fetcher(credentials.tokenUrl.trim(), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return null;
  const payload = await response.json() as Record<string, unknown>;
  return typeof payload.access_token === "string" && payload.access_token.trim() ? payload.access_token.trim() : null;
}

export async function fetchBolagsverketAnnualReportEvidence(
  organizationNumber: string | null | undefined,
  credentials: BolagsverketCredentials | null,
  options: { fetcher?: typeof fetch } = {},
): Promise<AdapterResult<ResearchLayerPayload<BolagsverketFilingsData>>> {
  const org = (organizationNumber ?? "").replace(/\D/g, "");
  if (org.length !== 10) return { ok: false, reason: "unsupported_symbol", message: "Bolagsverket annual-report lookup requires a Swedish 10-digit organization number.", diagnostic: providerDiagnostic("bolagsverket-hvd", "filings_events", "unsupported", "missing_organization_number") };
  if (!credentials?.clientId?.trim() || !credentials.clientSecret?.trim() || !credentials.tokenUrl?.trim() || !credentials.baseUrl?.trim()) {
    return { ok: false, reason: "not_configured", message: "Bolagsverket valuable-datasets credentials and environment-specific API endpoints are not configured.", diagnostic: providerDiagnostic("bolagsverket-hvd", "filings_events", "unavailable", "missing_credentials_or_endpoints") };
  }
  const fetcher = options.fetcher ?? fetch;
  try {
    const token = await getToken(credentials, fetcher);
    if (!token) return { ok: false, reason: "not_configured", message: "Bolagsverket OAuth token could not be obtained.", diagnostic: providerDiagnostic("bolagsverket-hvd", "filings_events", "unavailable", "oauth_failed") };
    const endpoint = `${credentials.baseUrl.trim().replace(/\/$/, "")}/dokumentlista`;
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Request-Id": crypto.randomUUID() },
      body: JSON.stringify({ identitetsbeteckning: org }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 429) return { ok: false, reason: "rate_limited", message: "Bolagsverket valuable-datasets rate limit reached.", diagnostic: providerDiagnostic("bolagsverket-hvd", "filings_events", "unavailable", "rate_limited") };
    if (!response.ok) return { ok: false, reason: "upstream_error", message: `Bolagsverket document list returned HTTP ${response.status}.`, diagnostic: providerDiagnostic("bolagsverket-hvd", "filings_events", "unavailable", `http_${response.status}`) };
    const documents = parseBolagsverketDocumentList(await response.json()).slice(0, 20);
    const accessedAt = new Date().toISOString();
    const publicSourceUrl = "https://bolagsverket.se/apierochoppnadata/hamtaforetagsinformation/vardefulladatamangder/apiforvardefulladatamangder.5513.html";
    const evidence: ResearchEvidence[] = documents.map((document) => ({
      id: `bolagsverket-${org}-${document.documentId}`,
      kind: "reported_fact",
      sourceTier: "regulatory_filing",
      title: `Bolagsverket digital annual report${document.reportingPeriodEnd ? ` — ${document.reportingPeriodEnd}` : ""}`,
      source: {
        name: "Bolagsverket — Värdefulla datamängder / digital årsredovisning",
        url: publicSourceUrl,
        accessedAt,
        freshness: "Official Bolagsverket document metadata for digitally filed annual reports; endpoint URLs are configured from the credentials supplied for the target environment.",
        provider: "bolagsverket-hvd",
        capability: "filings_events",
        dataAsOf: document.reportingPeriodEnd ?? document.registeredAt,
        version: "bolagsverket-hvd-adapter-v1",
      },
      dataAsOf: document.reportingPeriodEnd ?? document.registeredAt,
    }));
    const dataAsOf = documents[0]?.reportingPeriodEnd ?? documents[0]?.registeredAt ?? null;
    return {
      ok: true,
      data: { data: { organizationNumber: org, documents }, dataAsOf, coverage: documents.length ? 1 : 0.6, confidence: 98, evidence },
      diagnostic: providerDiagnostic("bolagsverket-hvd", "filings_events", documents.length ? "available" : "partial", documents.length ? undefined : "no_digital_reports_found"),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "upstream_error";
    return { ok: false, reason, message: "Bolagsverket valuable-datasets request failed.", diagnostic: providerDiagnostic("bolagsverket-hvd", "filings_events", "unavailable", reason) };
  }
}
