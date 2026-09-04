import type { CompanySearchResult } from "@/lib/analysis/types";
import type { CompanySearchProvider } from "./providers";
import { inferSecurityType } from "./security-classification";
import { searchCompanyCatalog as searchCompanyCatalogCore } from "./company-search-core";

export type { CanonicalCompanyResolution } from "./company-search-core";
export {
  curatedCompanySearchProvider,
  normalizedTicker,
  resolveCanonicalCompanySelection,
  scoreSearchMatch,
  secCompanySearchProvider,
} from "./company-search-core";

function normalizedIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizedCik(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "");
  return digits ? digits.padStart(10, "0") : null;
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isUsListing(company: CompanySearchResult): boolean {
  const country = normalizedIdentifier(company.country);
  const exchange = normalizedText(company.exchange);
  return country === "us" || /^(?:us|nasdaq|nyse|nyse arca|amex|nasdaqgs|nasdaqgm|nasdaqcm)$/.test(exchange);
}

function hasExchangeSuffix(ticker: string): boolean {
  return /\.[A-Z]{1,5}$/.test(ticker.trim().toUpperCase());
}

function exactUsListingKey(company: CompanySearchResult): string | null {
  const ticker = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  if (!ticker || hasExchangeSuffix(ticker) || !isUsListing(company)) return null;
  return `US:${ticker}`;
}

function explicitSecurityType(company: CompanySearchResult): Exclude<NonNullable<CompanySearchResult["securityType"]>, "Common Stock"> | null {
  const inferred = inferSecurityType({ ...company, securityType: undefined });
  return inferred === "Common Stock" ? null : inferred;
}

function stableIdentifiersCompatible(left: CompanySearchResult, right: CompanySearchResult): boolean {
  const simplePairs: Array<[string | null | undefined, string | null | undefined]> = [
    [left.securityId, right.securityId],
    [left.isin, right.isin],
    [left.figi, right.figi],
    [left.lei, right.lei],
    [left.issuerId, right.issuerId],
  ];
  if (simplePairs.some(([a, b]) => a && b && normalizedIdentifier(a) !== normalizedIdentifier(b))) return false;
  if (left.cik && right.cik && normalizedCik(left.cik) !== normalizedCik(right.cik)) return false;
  if (left.mic && right.mic && normalizedIdentifier(left.mic) !== normalizedIdentifier(right.mic)) return false;

  const leftExplicit = explicitSecurityType(left);
  const rightExplicit = explicitSecurityType(right);
  if (leftExplicit && rightExplicit && leftExplicit !== rightExplicit) return false;
  return true;
}

function identityRank(company: CompanySearchResult): number {
  if (company.securityId) return 5;
  if (company.isin || company.figi || company.lei) return 4;
  if (company.cik) return 3;
  if (company.issuerId) return 2;
  if (company.entityId) return 1;
  return 0;
}

function confidenceRank(value: CompanySearchResult["matchConfidence"]): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function preferredSearchRepresentation(left: CompanySearchResult, right: CompanySearchResult): CompanySearchResult {
  const leftExplicit = explicitSecurityType(left);
  const rightExplicit = explicitSecurityType(right);
  if (leftExplicit && !rightExplicit) return left;
  if (rightExplicit && !leftExplicit) return right;
  const leftScore = left.matchScore ?? 0;
  const rightScore = right.matchScore ?? 0;
  if (rightScore !== leftScore) return rightScore > leftScore ? right : left;
  const confidenceDelta = confidenceRank(right.matchConfidence) - confidenceRank(left.matchConfidence);
  if (confidenceDelta !== 0) return confidenceDelta > 0 ? right : left;
  return identityRank(right) > identityRank(left) ? right : left;
}

function mergeAnalysisCapability(
  left: CompanySearchResult,
  right: CompanySearchResult,
  fundamentals: boolean,
  marketData: boolean,
): CompanySearchResult["analysisCapability"] {
  const levels = [left.analysisCapability?.fundamentals, right.analysisCapability?.fundamentals];
  const fundamentalsLevel = levels.includes("full")
    ? "full"
    : levels.includes("partial") || fundamentals
      ? "partial"
      : "unavailable";
  const supportiveReason = [left, right]
    .find((item) => item.analysisCapability?.fundamentals && item.analysisCapability.fundamentals !== "unavailable")
    ?.analysisCapability?.reason;
  return {
    fundamentals: fundamentalsLevel,
    marketData: marketData ? "available" : "unavailable",
    ...(supportiveReason ? { reason: supportiveReason } : {}),
  };
}

function mergeExactUsListing(left: CompanySearchResult, right: CompanySearchResult): CompanySearchResult {
  const preferredSearch = preferredSearchRepresentation(left, right);
  const secondarySearch = preferredSearch === left ? right : left;
  const preferredIdentity = identityRank(right) > identityRank(left) ? right : left;
  const secondaryIdentity = preferredIdentity === left ? right : left;
  const explicitType = explicitSecurityType(left) ?? explicitSecurityType(right);
  const securityType = explicitType ?? preferredSearch.securityType ?? secondarySearch.securityType ?? "Common Stock";
  const fundamentals = Boolean(left.providerCapabilities?.fundamentals || right.providerCapabilities?.fundamentals);
  const marketData = Boolean(left.providerCapabilities?.marketData || right.providerCapabilities?.marketData);
  const providerIds = [...new Set([
    ...(left.providerCapabilities?.providerIds ?? []),
    ...(right.providerCapabilities?.providerIds ?? []),
  ])].sort();

  return {
    ...secondarySearch,
    ...preferredSearch,
    securityId: preferredIdentity.securityId ?? secondaryIdentity.securityId,
    issuerId: preferredIdentity.issuerId ?? secondaryIdentity.issuerId,
    entityId: preferredIdentity.entityId ?? secondaryIdentity.entityId,
    isin: preferredIdentity.isin ?? secondaryIdentity.isin,
    figi: preferredIdentity.figi ?? secondaryIdentity.figi,
    lei: preferredIdentity.lei ?? secondaryIdentity.lei,
    cik: preferredIdentity.cik ?? secondaryIdentity.cik,
    country: preferredSearch.country ?? secondarySearch.country,
    exchange: preferredSearch.exchange ?? secondarySearch.exchange,
    mic: preferredSearch.mic ?? secondarySearch.mic,
    currency: preferredSearch.currency ?? secondarySearch.currency,
    securityType,
    primarySecurity: securityType === "Common Stock"
      ? Boolean(left.primarySecurity || right.primarySecurity)
      : false,
    providerCapabilities: { fundamentals, marketData, providerIds },
    analysisCapability: mergeAnalysisCapability(left, right, fundamentals, marketData),
    matchScore: Math.max(left.matchScore ?? 0, right.matchScore ?? 0),
    matchConfidence: confidenceRank(left.matchConfidence) >= confidenceRank(right.matchConfidence)
      ? left.matchConfidence
      : right.matchConfidence,
    matchReasons: [...new Set([...(left.matchReasons ?? []), ...(right.matchReasons ?? []), "Cross-provider exact US listing identity merge"])],
    primaryCandidate: Boolean(left.primaryCandidate || right.primaryCandidate),
  };
}

function coalesceExactUsListings(results: CompanySearchResult[], query: string): CompanySearchResult[] {
  const output: CompanySearchResult[] = [];
  const indexes = new Map<string, number[]>();

  for (const company of results) {
    const key = exactUsListingKey(company);
    if (!key) {
      output.push(company);
      continue;
    }

    const candidateIndexes = indexes.get(key) ?? [];
    const compatibleIndex = candidateIndexes.find((index) => stableIdentifiersCompatible(output[index], company));
    if (compatibleIndex === undefined) {
      candidateIndexes.push(output.length);
      indexes.set(key, candidateIndexes);
      output.push(company);
      continue;
    }
    output[compatibleIndex] = mergeExactUsListing(output[compatibleIndex], company);
  }

  const requestedTicker = query.trim().toUpperCase();
  const exactIndexes = output
    .map((company, index) => ({ company, index }))
    .filter(({ company }) => (company.canonicalTicker ?? company.ticker).trim().toUpperCase() === requestedTicker);
  if (exactIndexes.length === 1) {
    const { index } = exactIndexes[0];
    const company = output[index];
    output[index] = {
      ...company,
      matchConfidence: (company.matchScore ?? 0) >= 92 ? "high" : company.matchConfidence,
      primaryCandidate: true,
    };
  }

  return output.slice(0, 20);
}

export async function searchCompanyCatalog(
  query: string,
  configuredCatalogProviders: CompanySearchProvider[] = [],
): Promise<CompanySearchResult[]> {
  const results = await searchCompanyCatalogCore(query, configuredCatalogProviders);
  return coalesceExactUsListings(results, query);
}
