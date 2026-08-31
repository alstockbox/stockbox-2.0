import type { AnalysisSource, CompanySearchResult } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult } from "./providers";

export type GleifCandidate = {
  lei: string;
  legalName: string;
  country: string | null;
  jurisdiction?: string | null;
  registrationAuthorityEntityId: string | null;
  registeredAs?: string | null;
};

export type GleifIdentity = GleifCandidate & { source: AnalysisSource };

const LEGAL_SUFFIXES = new Set(["AB", "PUBL", "PLC", "LTD", "LIMITED", "INC", "INCORPORATED", "CORP", "CORPORATION", "GROUP", "HOLDING", "HOLDINGS", "OYJ", "ASA", "AS", "SA", "AG", "GMBH", "NV", "BV"]);

function normalizedName(value: string | null | undefined): string[] {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !LEGAL_SUFFIXES.has(token));
}

function nameSimilarity(left: string, right: string): number {
  const a = new Set(normalizedName(left));
  const b = new Set(normalizedName(right));
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  const precision = overlap / b.size;
  const recall = overlap / a.size;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function normalizeCountry(value: string | null | undefined): string | null {
  const country = value?.trim().toUpperCase();
  if (!country) return null;
  if (["SWEDEN", "SVERIGE"].includes(country)) return "SE";
  if (["UNITED STATES", "USA", "US"].includes(country)) return "US";
  if (["UNITED KINGDOM", "UK", "GB"].includes(country)) return "GB";
  return country;
}

export function pickGleifCandidate(
  candidates: GleifCandidate[],
  company: Pick<CompanySearchResult, "name" | "country" | "lei">,
): GleifCandidate | null {
  if (company.lei) return candidates.find((candidate) => candidate.lei.toUpperCase() === company.lei?.toUpperCase()) ?? null;
  const expectedCountry = normalizeCountry(company.country);
  const ranked = candidates
    .map((candidate) => {
      const similarity = nameSimilarity(company.name, candidate.legalName);
      const country = normalizeCountry(candidate.country ?? candidate.jurisdiction);
      const countryFit = !expectedCountry || !country ? 0 : country === expectedCountry ? 1 : -2;
      return { candidate, similarity, score: similarity * 10 + countryFit };
    })
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.similarity < 0.8) return null;
  if (expectedCountry && normalizeCountry(best.candidate.country ?? best.candidate.jurisdiction) && normalizeCountry(best.candidate.country ?? best.candidate.jurisdiction) !== expectedCountry) return null;
  const second = ranked[1];
  if (second && best.score - second.score < 0.75 && best.candidate.lei !== second.candidate.lei) return null;
  return best.candidate;
}

function stringAt(record: unknown, path: string[]): string | null {
  let cursor: unknown = record;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor.trim() : null;
}

function parseGleifRecords(payload: unknown): GleifCandidate[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>).data;
  const items = Array.isArray(data) ? data : data ? [data] : [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const lei = stringAt(item, ["id"]);
    const legalName = stringAt(item, ["attributes", "entity", "legalName", "name"]);
    if (!lei || !legalName) return [];
    return [{
      lei,
      legalName,
      country: stringAt(item, ["attributes", "entity", "legalAddress", "country"]),
      jurisdiction: stringAt(item, ["attributes", "entity", "jurisdiction"]),
      registrationAuthorityEntityId: stringAt(item, ["attributes", "entity", "registrationAuthority", "registrationAuthorityEntityId"]),
      registeredAs: stringAt(item, ["attributes", "entity", "registeredAs"]),
    }];
  });
}

export function normalizeSwedishOrganizationNumber(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

export async function resolveGleifIdentity(
  company: CompanySearchResult,
  options: { fetcher?: typeof fetch } = {},
): Promise<AdapterResult<GleifIdentity>> {
  const fetcher = options.fetcher ?? fetch;
  const endpoint = company.lei
    ? `https://api.gleif.org/api/v1/lei-records/${encodeURIComponent(company.lei)}`
    : `https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D=${encodeURIComponent(company.name)}&page%5Bsize%5D=5`;
  try {
    const response = await fetcher(endpoint, { headers: { Accept: "application/vnd.api+json" }, signal: AbortSignal.timeout(6_000) });
    if (response.status === 429) return { ok: false, reason: "rate_limited", message: "GLEIF rate limit reached.", diagnostic: providerDiagnostic("gleif", "search", "unavailable", "rate_limited") };
    if (response.status === 404) return { ok: false, reason: "not_found", message: "GLEIF identity was not found.", diagnostic: providerDiagnostic("gleif", "search", "unsupported", "not_found") };
    if (!response.ok) return { ok: false, reason: "upstream_error", message: `GLEIF returned HTTP ${response.status}.`, diagnostic: providerDiagnostic("gleif", "search", "unavailable", `http_${response.status}`) };
    const candidate = pickGleifCandidate(parseGleifRecords(await response.json()), company);
    if (!candidate) return { ok: false, reason: "not_found", message: "GLEIF did not return a sufficiently strong legal-entity match.", diagnostic: providerDiagnostic("gleif", "search", "unsupported", "ambiguous_or_missing_match") };
    const accessedAt = new Date().toISOString();
    return {
      ok: true,
      data: {
        ...candidate,
        source: {
          name: "GLEIF Legal Entity Identifier record",
          url: `https://api.gleif.org/api/v1/lei-records/${encodeURIComponent(candidate.lei)}`,
          accessedAt,
          freshness: "Current GLEIF Golden Copy legal-entity reference data.",
          provider: "gleif",
          capability: "search",
          dataAsOf: accessedAt.slice(0, 10),
          version: "gleif-lei-adapter-v1",
        },
      },
      diagnostic: providerDiagnostic("gleif", "search", "available"),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "upstream_error";
    return { ok: false, reason, message: "GLEIF request failed.", diagnostic: providerDiagnostic("gleif", "search", "unavailable", reason) };
  }
}
