import type { CompanySearchResult } from "@/lib/analysis/types";
import {
  resolveCanonicalCompanySelection,
  type CanonicalCompanyResolution,
} from "@/lib/data/company-search";

function tickerCandidates(company: CompanySearchResult): string[] {
  return [
    company.canonicalTicker,
    company.ticker,
    company.localTicker,
    ...(company.providerTickers ?? []),
  ].filter((value): value is string => Boolean(value)).map((value) => value.trim().toUpperCase());
}

function identityStrength(company: CompanySearchResult): number {
  return Number(Boolean(company.securityId)) * 8
    + Number(Boolean(company.isin)) * 6
    + Number(Boolean(company.figi)) * 6
    + Number(Boolean(company.lei)) * 4
    + Number(Boolean(company.cik)) * 4
    + Number(Boolean(company.entityId)) * 3
    + Number(Boolean(company.issuerId)) * 2;
}

function coverageStrength(company: CompanySearchResult): number {
  return Number(Boolean(company.providerCapabilities?.fundamentals)) * 8
    + Number(Boolean(company.providerCapabilities?.marketData)) * 3
    + Math.min(company.providerCapabilities?.providerIds.length ?? 0, 4);
}

function securityTypeStrength(requested: CompanySearchResult, company: CompanySearchResult): number {
  if (requested.securityType) return company.securityType === requested.securityType ? 80 : -80;
  if (company.securityType === "Common Stock") return 30;
  if (company.securityType === "ADR") return 12;
  if (company.securityType === "ETF/Fund") return 8;
  if (company.securityType === "Preferred") return 2;
  return 0;
}

function locationStrength(requestedTicker: string, company: CompanySearchResult): number {
  if (requestedTicker.includes(".")) return 0;
  const country = company.country?.trim().toUpperCase();
  const exchange = company.exchange?.trim().toUpperCase() ?? "";
  return country === "US" || /NASDAQ|NYSE|AMEX/.test(exchange) ? 6 : 0;
}

function relevanceScore(
  requested: CompanySearchResult,
  requestedTicker: string,
  company: CompanySearchResult,
): number {
  const canonical = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  const confidence = company.matchConfidence === "high" ? 12 : company.matchConfidence === "medium" ? 5 : 0;
  return Number(canonical === requestedTicker) * 1_000
    + Number(Boolean(company.primaryCandidate)) * 120
    + Number(Boolean(company.primarySecurity)) * 60
    + securityTypeStrength(requested, company)
    + coverageStrength(company)
    + identityStrength(company)
    + locationStrength(requestedTicker, company)
    + confidence
    + Math.min(Math.max(company.matchScore ?? 0, 0), 100) / 10;
}

function deterministicKey(company: CompanySearchResult): string {
  return [
    company.securityId,
    company.isin,
    company.figi,
    company.canonicalTicker,
    company.country,
    company.exchange,
    company.name,
  ].map((value) => value ?? "").join("|").toUpperCase();
}

export function resolveMostRelevantCompanySelection(
  requested: CompanySearchResult,
  candidates: CompanySearchResult[],
): CanonicalCompanyResolution {
  const baseline = resolveCanonicalCompanySelection(requested, candidates);
  if (baseline.ok || baseline.reason !== "ambiguous") return baseline;

  const requestedTicker = (requested.canonicalTicker ?? requested.ticker).trim().toUpperCase();
  const compatible = candidates.filter((candidate) => {
    if (!tickerCandidates(candidate).includes(requestedTicker)) return false;
    return resolveCanonicalCompanySelection(requested, [candidate]).ok;
  });
  if (!compatible.length) return baseline;

  const ranked = compatible
    .map((company) => ({
      company,
      score: relevanceScore(requested, requestedTicker, company),
      key: deterministicKey(company),
    }))
    .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key));

  return { ok: true, company: ranked[0].company };
}
