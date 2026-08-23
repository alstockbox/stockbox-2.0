import type { CompanySearchResult } from "@/lib/analysis/types";
import { commonCompanies } from "./common-companies";
import { entityIdentityFor } from "./entity-identities";
import { fetchSecTickerUniverse } from "./sec";
import { providerDiagnostic, type AdapterResult, type CompanySearchProvider, type ProviderCapabilities } from "./providers";

const SEARCH_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["global"],
  supportedExchanges: ["catalog dependent"],
  supportsFundamentals: false,
  supportsMarketData: false,
  supportsEstimates: false,
};

function normalizedText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizedTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\.ST$/, "").replace(/[.\-\s]/g, "");
}

function securityType(company: CompanySearchResult): NonNullable<CompanySearchResult["securityType"]> {
  if (company.securityType) return company.securityType;
  const text = `${company.ticker} ${company.name}`.toLowerCase();
  if (/preferred|depositary shares|\bpfd\b|[-.]p[a-z]?\b/.test(text)) return "Preferred";
  if (/\betf\b|\bfund\b|portfolio|trust index/.test(text)) return "ETF/Fund";
  if (/\badr\b|american depositary/.test(text)) return "ADR";
  return "Common Stock";
}

function enrich(
  company: CompanySearchResult,
  provider: Pick<CompanySearchProvider, "id" | "capabilities">,
): CompanySearchResult {
  const identity = entityIdentityFor(company);
  const cik = identity?.currentCik ?? company.cik;
  const type = securityType(company);
  const providerIds = new Set([...(company.providerCapabilities?.providerIds ?? []), provider.id]);
  const fundamentalsSupported = company.providerCapabilities?.fundamentals
    ?? (provider.capabilities.supportsFundamentals && Boolean(cik));
  if (fundamentalsSupported) providerIds.add("sec-companyfacts");
  return {
    ...company,
    ticker: company.ticker.toUpperCase(),
    canonicalTicker: company.canonicalTicker ?? company.ticker.toUpperCase(),
    cik,
    entityId: identity?.canonicalId ?? company.entityId ?? (cik ? `sec:${cik}` : `listing:${company.country ?? "unknown"}:${company.ticker.toUpperCase()}`),
    securityType: type,
    providerCapabilities: {
      fundamentals: fundamentalsSupported,
      marketData: company.providerCapabilities?.marketData ?? company.country === "US",
      providerIds: [...providerIds].sort(),
    },
  };
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function searchRank(company: CompanySearchResult, query: string): number {
  const rawQuery = query.trim().toUpperCase();
  const ticker = (company.canonicalTicker ?? company.ticker).toUpperCase();
  const normalizedQueryTicker = normalizedTicker(query);
  const normalizedCompanyTicker = normalizedTicker(ticker);
  const queryText = normalizedText(query);
  const name = normalizedText(company.name);
  const aliases = (company.searchAliases ?? []).map(normalizedText);
  const securityPenalty = company.securityType === "Common Stock" ? 0 : company.securityType === "ADR" ? 2 : 5;
  if (rawQuery === ticker || rawQuery === company.ticker.toUpperCase()) return securityPenalty;
  if (normalizedQueryTicker && normalizedQueryTicker === normalizedCompanyTicker) return 10 + securityPenalty;
  if (aliases.some((alias) => alias === queryText)) return 15 + securityPenalty;
  if (name.startsWith(queryText)) return 20 + securityPenalty;
  if (name.includes(queryText) || aliases.some((alias) => alias.includes(queryText))) return 30 + securityPenalty;
  const compactName = name.replace(/\s/g, "");
  const compactQuery = queryText.replace(/\s/g, "");
  if (compactQuery.length >= 3 && (editDistance(compactQuery, normalizedCompanyTicker.toLowerCase()) <= 2 || editDistance(compactQuery, compactName.slice(0, compactQuery.length)) <= 2)) {
    return 50 + securityPenalty;
  }
  return Number.POSITIVE_INFINITY;
}

function mergeCompany(current: CompanySearchResult | undefined, candidate: CompanySearchResult): CompanySearchResult {
  if (!current) return candidate;
  const providerIds = new Set([...(current.providerCapabilities?.providerIds ?? []), ...(candidate.providerCapabilities?.providerIds ?? [])]);
  return {
    ...candidate,
    ...current,
    cik: candidate.cik ?? current.cik,
    exchange: current.exchange && current.exchange !== "US" ? current.exchange : candidate.exchange ?? current.exchange,
    searchAliases: [...new Set([...(current.searchAliases ?? []), ...(candidate.searchAliases ?? [])])],
    providerCapabilities: {
      fundamentals: Boolean(current.providerCapabilities?.fundamentals || candidate.providerCapabilities?.fundamentals),
      marketData: Boolean(current.providerCapabilities?.marketData || candidate.providerCapabilities?.marketData),
      providerIds: [...providerIds].sort(),
    },
  };
}

export const curatedCompanySearchProvider: CompanySearchProvider = {
  id: "curated-catalog",
  capabilities: SEARCH_CAPABILITIES,
  async search(): Promise<AdapterResult<CompanySearchResult[]>> {
    return {
      ok: true,
      data: commonCompanies.map((company) => enrich(company, curatedCompanySearchProvider)),
      diagnostic: providerDiagnostic("Curated company catalog", "search", "available"),
    };
  },
};

export const secCompanySearchProvider: CompanySearchProvider = {
  id: "sec-ticker-universe",
  capabilities: { ...SEARCH_CAPABILITIES, supportedCountries: ["US", "SEC registrants"], supportsFundamentals: true },
  async search(): Promise<AdapterResult<CompanySearchResult[]>> {
    const companies = await fetchSecTickerUniverse();
    return {
      ok: true,
      data: companies.map((company) => enrich(company, secCompanySearchProvider)),
      diagnostic: providerDiagnostic("SEC ticker universe", "search", "available"),
    };
  },
};

export async function searchCompanyCatalog(
  query: string,
  configuredCatalogProviders: CompanySearchProvider[] = [],
): Promise<CompanySearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const providers = [...configuredCatalogProviders, curatedCompanySearchProvider, secCompanySearchProvider];
  const providerResults = await Promise.all(providers.map((provider) => provider.search(normalizedQuery)));
  const merged = new Map<string, CompanySearchResult>();
  for (const [providerIndex, result] of providerResults.entries()) {
    if (!result.ok) continue;
    for (const company of result.data) {
      const enriched = enrich(company, providers[providerIndex]);
      const key = `${enriched.entityId ?? `${enriched.country ?? "unknown"}:unknown-issuer`}:${normalizedTicker(enriched.canonicalTicker ?? enriched.ticker)}:${enriched.securityType}`;
      merged.set(key, mergeCompany(merged.get(key), enriched));
    }
  }
  return [...merged.values()]
    .map((company) => ({ company, rank: searchRank(company, normalizedQuery) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank || left.company.name.localeCompare(right.company.name))
    .slice(0, 20)
    .map(({ company }) => {
      const publicCompany = { ...company };
      delete publicCompany.searchAliases;
      return publicCompany;
    });
}
