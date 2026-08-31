import type { AnalysisSource, CompanySearchResult } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult } from "./providers";

export type OpenFigiCandidate = {
  figi: string;
  ticker?: string | null;
  name?: string | null;
  exchCode?: string | null;
  securityType?: string | null;
  securityType2?: string | null;
  compositeFIGI?: string | null;
  shareClassFIGI?: string | null;
};

export type OpenFigiIdentity = {
  figi: string;
  compositeFigi: string | null;
  shareClassFigi: string | null;
  ticker: string | null;
  exchangeCode: string | null;
  source: AnalysisSource;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function nameTokens(value: string | null | undefined): Set<string> {
  return new Set((value ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !["AB", "INC", "CORP", "LTD", "PLC", "GROUP", "HOLDING", "HOLDINGS", "PUBL"].includes(token)));
}

function tokenCoverage(left: string | null | undefined, right: string | null | undefined): number {
  const expected = nameTokens(left);
  const actual = nameTokens(right);
  if (!expected.size || !actual.size) return 0;
  const overlap = [...expected].filter((token) => actual.has(token)).length;
  return overlap / Math.max(1, expected.size);
}

export function pickOpenFigiCandidate(
  candidates: OpenFigiCandidate[],
  company: Pick<CompanySearchResult, "ticker" | "canonicalTicker" | "name" | "securityType" | "mic">,
): OpenFigiCandidate | null {
  const expectedTicker = normalize(company.canonicalTicker ?? company.ticker).replace(/ST$/, "");
  const scored = candidates
    .filter((candidate) => typeof candidate.figi === "string" && candidate.figi.trim())
    .map((candidate) => {
      const securityType = `${candidate.securityType2 ?? ""} ${candidate.securityType ?? ""}`.toLowerCase();
      const commonStockFit = company.securityType !== "Common Stock" || /common stock|equity/.test(securityType);
      const ticker = normalize(candidate.ticker).replace(/ST$/, "");
      const tickerFit = ticker && expectedTicker ? ticker === expectedTicker : false;
      const nameFit = tokenCoverage(company.name, candidate.name);
      const micFit = company.mic && candidate.exchCode ? normalize(company.mic) === normalize(candidate.exchCode) : false;
      const score = (tickerFit ? 5 : 0) + nameFit * 4 + (commonStockFit ? 2 : -4) + (micFit ? 1 : 0);
      return { candidate, score, nameFit, tickerFit, commonStockFit };
    })
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  if (!best || !best.commonStockFit) return null;
  if (!best.tickerFit && best.nameFit < 0.75) return null;
  if (best.score < 5) return null;
  const second = scored[1];
  if (second && best.score - second.score < 0.5 && best.candidate.figi !== second.candidate.figi) return null;
  return best.candidate;
}

function parseCandidates(payload: unknown): OpenFigiCandidate[] {
  if (!Array.isArray(payload)) return [];
  const first = payload[0];
  if (!first || typeof first !== "object") return [];
  const data = (first as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.figi !== "string") return [];
    return [{
      figi: record.figi,
      ticker: typeof record.ticker === "string" ? record.ticker : null,
      name: typeof record.name === "string" ? record.name : null,
      exchCode: typeof record.exchCode === "string" ? record.exchCode : null,
      securityType: typeof record.securityType === "string" ? record.securityType : null,
      securityType2: typeof record.securityType2 === "string" ? record.securityType2 : null,
      compositeFIGI: typeof record.compositeFIGI === "string" ? record.compositeFIGI : null,
      shareClassFIGI: typeof record.shareClassFIGI === "string" ? record.shareClassFIGI : null,
    }];
  });
}

export async function resolveOpenFigiIdentity(
  company: CompanySearchResult,
  options: { apiKey?: string | null; fetcher?: typeof fetch } = {},
): Promise<AdapterResult<OpenFigiIdentity>> {
  if (company.figi) {
    const accessedAt = new Date().toISOString();
    return {
      ok: true,
      data: {
        figi: company.figi,
        compositeFigi: null,
        shareClassFigi: null,
        ticker: company.canonicalTicker ?? company.ticker,
        exchangeCode: company.mic ?? company.exchange ?? null,
        source: { name: "Existing FIGI identity", url: "https://www.openfigi.com/", accessedAt, freshness: "Identity was already present in the StockBox security master.", provider: "openfigi", capability: "search", dataAsOf: accessedAt.slice(0, 10), version: "openfigi-v3-adapter-v1" },
      },
      diagnostic: providerDiagnostic("openfigi", "search", "available", "existing_identity"),
    };
  }

  const job: Record<string, string> = company.isin
    ? { idType: "ID_ISIN", idValue: company.isin }
    : { idType: "TICKER", idValue: company.canonicalTicker ?? company.ticker };
  if (!company.isin && company.mic) job.micCode = company.mic;
  if (!job.idValue) {
    return { ok: false, reason: "unsupported_symbol", message: "No usable identifier is available for OpenFIGI mapping.", diagnostic: providerDiagnostic("openfigi", "search", "unsupported", "missing_identifier") };
  }

  const headers: HeadersInit = { Accept: "application/json", "Content-Type": "application/json" };
  if (options.apiKey?.trim()) headers["X-OPENFIGI-APIKEY"] = options.apiKey.trim();
  try {
    const response = await (options.fetcher ?? fetch)("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers,
      body: JSON.stringify([job]),
      signal: AbortSignal.timeout(6_000),
    });
    if (response.status === 429) return { ok: false, reason: "rate_limited", message: "OpenFIGI rate limit reached.", diagnostic: providerDiagnostic("openfigi", "search", "unavailable", "rate_limited") };
    if (!response.ok) return { ok: false, reason: "upstream_error", message: `OpenFIGI returned HTTP ${response.status}.`, diagnostic: providerDiagnostic("openfigi", "search", "unavailable", `http_${response.status}`) };
    const candidate = pickOpenFigiCandidate(parseCandidates(await response.json()), company);
    if (!candidate) return { ok: false, reason: "not_found", message: "OpenFIGI did not return a sufficiently specific identity match.", diagnostic: providerDiagnostic("openfigi", "search", "unsupported", "ambiguous_or_missing_match") };
    const accessedAt = new Date().toISOString();
    return {
      ok: true,
      data: {
        figi: candidate.figi,
        compositeFigi: candidate.compositeFIGI ?? null,
        shareClassFigi: candidate.shareClassFIGI ?? null,
        ticker: candidate.ticker ?? null,
        exchangeCode: candidate.exchCode ?? null,
        source: { name: "OpenFIGI instrument mapping", url: "https://www.openfigi.com/", accessedAt, freshness: "Live identifier mapping from OpenFIGI v3.", provider: "openfigi", capability: "search", dataAsOf: accessedAt.slice(0, 10), version: "openfigi-v3-adapter-v1" },
      },
      diagnostic: providerDiagnostic("openfigi", "search", "available"),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "upstream_error";
    return { ok: false, reason, message: "OpenFIGI request failed.", diagnostic: providerDiagnostic("openfigi", "search", "unavailable", reason) };
  }
}
