import type { CompanySearchResult } from "@/lib/analysis/types";

const LEGAL_NAME_TOKENS = new Set([
  "ab",
  "ag",
  "asa",
  "aktiebolag",
  "aktiebolaget",
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "limited",
  "ltd",
  "nv",
  "oyj",
  "plc",
  "publ",
  "sa",
  "se",
  "spa",
  "telefonaktiebolaget",
]);

function normalizedNameTokens(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !LEGAL_NAME_TOKENS.has(token));
}

function endsWithTokens(candidate: string[], query: string[]): boolean {
  if (!query.length || candidate.length < query.length) return false;
  const start = candidate.length - query.length;
  return query.every((token, index) => candidate[start + index] === token);
}

function candidateMatchesName(holdingName: string, candidate: CompanySearchResult): boolean {
  const query = normalizedNameTokens(holdingName);
  if (!query.length) return false;
  const names = [candidate.name, ...(candidate.searchAliases ?? [])];
  return names.some((name) => endsWithTokens(normalizedNameTokens(name), query));
}

function stableIssuerKey(candidate: CompanySearchResult): string | null {
  if (candidate.issuerId?.trim()) return `issuer:${candidate.issuerId.trim().toLowerCase()}`;
  if (candidate.entityId?.trim()) return `entity:${candidate.entityId.trim().toLowerCase()}`;
  if (candidate.lei?.trim()) return `lei:${candidate.lei.trim().toLowerCase()}`;
  return null;
}

function candidateQuality(candidate: CompanySearchResult): number {
  let score = 0;
  if (candidate.analysisCapability?.fundamentals === "full") score += 16;
  else if (candidate.analysisCapability?.fundamentals === "partial") score += 8;
  if (candidate.providerCapabilities?.fundamentals) score += 4;
  if (candidate.analysisCapability?.marketData === "available") score += 2;
  if (candidate.providerCapabilities?.marketData) score += 1;
  if (candidate.canonicalTicker?.trim()) score += 0.5;
  if (candidate.primarySecurity) score += 0.25;
  return score;
}

function preferredCandidate(candidates: CompanySearchResult[]): CompanySearchResult {
  return [...candidates].sort((left, right) => {
    const scoreDifference = candidateQuality(right) - candidateQuality(left);
    if (scoreDifference !== 0) return scoreDifference;
    return (left.canonicalTicker ?? left.ticker).localeCompare(right.canonicalTicker ?? right.ticker);
  })[0];
}

export function resolveInvestmentCompanyHoldingCandidate(
  holdingName: string,
  candidates: CompanySearchResult[],
): CompanySearchResult | null {
  const matches = candidates.filter((candidate) => (
    candidate.securityType === "Common Stock"
    && candidateMatchesName(holdingName, candidate)
  ));
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];

  const issuerKeys = matches.map(stableIssuerKey);
  if (issuerKeys.some((key) => key === null)) return null;
  if (new Set(issuerKeys).size !== 1) return null;

  return preferredCandidate(matches);
}
