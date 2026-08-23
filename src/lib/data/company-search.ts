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
    primarySecurity: company.primarySecurity ?? type === "Common Stock",
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

type SearchMatch = {
  score: number;
  type: NonNullable<CompanySearchResult["matchType"]>;
  reasons: string[];
};

const SECURITY_QUERY_WORDS = new Set(["preferred", "preference", "pfd", "adr", "etf", "fund", "common", "stock", "shares", "share", "class"]);
const MATCH_SCORE_CEILINGS: Record<NonNullable<CompanySearchResult["matchType"]>, number> = {
  exact_canonical_ticker: 100,
  exact_provider_ticker: 99,
  exact_alias: 97,
  exact_company_name: 95,
  company_name_prefix: 92,
  token_coverage: 90,
  ticker_typo: 86,
  name_typo: 82,
};

function queryTokens(query: string): string[] {
  return normalizedText(query).split(" ").filter((token) => token && !SECURITY_QUERY_WORDS.has(token));
}

function requestedPreferred(query: string): boolean {
  return /\b(preferred|preference|pfd)\b/i.test(query);
}

function requestedAdr(query: string): boolean {
  return /\badr\b|american depositary/i.test(query);
}

export function scoreSearchMatch(company: CompanySearchResult, query: string): SearchMatch | null {
  const rawQuery = query.trim().toUpperCase();
  const ticker = (company.canonicalTicker ?? company.ticker).toUpperCase();
  const normalizedQueryTicker = normalizedTicker(query);
  const normalizedCompanyTicker = normalizedTicker(ticker);
  const queryText = normalizedText(query);
  const name = normalizedText(company.name);
  const aliases = (company.searchAliases ?? []).map(normalizedText);
  const preferredIntent = requestedPreferred(query);
  const adrIntent = requestedAdr(query);
  const exactCanonical = rawQuery === ticker;
  const exactProvider = rawQuery === company.ticker.toUpperCase();
  let match: SearchMatch | null = null;
  if (exactCanonical) match = { score: 100, type: "exact_canonical_ticker", reasons: ["Exact canonical ticker"] };
  else if (exactProvider) match = { score: 99, type: "exact_provider_ticker", reasons: ["Exact provider ticker"] };
  else if (normalizedQueryTicker && normalizedQueryTicker === normalizedCompanyTicker) match = { score: 98, type: "exact_canonical_ticker", reasons: ["Normalized canonical ticker match"] };
  else if (aliases.some((alias) => alias === queryText)) match = { score: 96, type: "exact_alias", reasons: ["Exact known alias"] };
  else if (name === queryText) match = { score: 94, type: "exact_company_name", reasons: ["Exact normalized company name"] };
  else if (name.startsWith(queryText)) match = { score: 86, type: "company_name_prefix", reasons: ["Company-name prefix"] };
  const tokens = queryTokens(query);
  const searchableTokens = new Set([name, ...aliases].join(" ").split(" "));
  const tokenCoverage = tokens.length ? tokens.filter((token) => searchableTokens.has(token)).length / tokens.length : 0;
  if (!match && tokenCoverage > 0) match = { score: 60 + tokenCoverage * 20, type: "token_coverage", reasons: [`${Math.round(tokenCoverage * 100)}% query-token coverage`] };
  const securityRoot = normalizedTicker(tokens[0] ?? "");
  if (!match && preferredIntent && securityRoot && normalizedCompanyTicker.startsWith(securityRoot)) {
    match = { score: 82, type: "token_coverage", reasons: ["Issuer ticker and preferred-security intent matched"] };
  }
  const compactName = name.replace(/\s/g, "");
  const compactQuery = queryText.replace(/\s/g, "");
  const tickerDistance = editDistance(normalizedQueryTicker.toLowerCase(), normalizedCompanyTicker.toLowerCase());
  const nameDistance = editDistance(compactQuery, compactName.slice(0, compactQuery.length));
  if (!match && compactQuery.length >= 3 && tickerDistance <= 2) match = { score: 74 - tickerDistance * 4, type: "ticker_typo", reasons: [`Ticker typo distance ${tickerDistance}`] };
  if (!match && compactQuery.length >= 4 && nameDistance <= 2) match = { score: 70 - nameDistance * 4, type: "name_typo", reasons: [`Name typo distance ${nameDistance}`] };
  if (!match) return null;

  const explicitSecurityTicker = match.type === "exact_canonical_ticker" || match.type === "exact_provider_ticker";
  if (company.securityType === "Preferred") {
    if (preferredIntent) { match.score += 14; match.reasons.push("Preferred security requested"); }
    else if (!explicitSecurityTicker) { match.score -= 24; match.reasons.push("Preferred security de-prioritized"); }
  } else if (preferredIntent) {
    match.score -= 18;
  }
  if (company.securityType === "ADR") {
    if (adrIntent) { match.score += 10; match.reasons.push("ADR requested"); }
    else if (!explicitSecurityTicker) { match.score -= 10; match.reasons.push("ADR de-prioritized without ADR intent"); }
  }
  if (company.securityType === "ETF/Fund" && !explicitSecurityTicker && !/\b(etf|fund)\b/i.test(query)) {
    match.score -= 28;
    match.reasons.push("Fund de-prioritized for company search");
  }
  if (company.securityType === "Common Stock" && !preferredIntent) { match.score += 6; match.reasons.push("Common stock preference"); }
  if (company.primarySecurity && !preferredIntent && !adrIntent) { match.score += 4; match.reasons.push("Primary security preference"); }

  const explicitLocation = [company.exchange, company.country].filter(Boolean).some((value) => normalizedText(query).includes(normalizedText(value as string)));
  if (explicitLocation) { match.score += 4; match.reasons.push("Exchange or country intent matched"); }
  if (match.score >= 65) {
    if (company.providerCapabilities?.fundamentals) { match.score += 2; match.reasons.push("Live fundamentals available"); }
    if (company.providerCapabilities?.marketData) { match.score += 1; match.reasons.push("Live market data available"); }
  }
  match.score = Math.max(0, Math.min(MATCH_SCORE_CEILINGS[match.type], Math.round(match.score * 10) / 10));
  return match;
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
    .flatMap((company) => {
      const match = scoreSearchMatch(company, normalizedQuery);
      return match ? [{ company, match }] : [];
    })
    .sort((left, right) => right.match.score - left.match.score || left.company.name.localeCompare(right.company.name))
    .slice(0, 20)
    .map(({ company, match }, index, ranked) => {
      const second = ranked[index === 0 ? 1 : 0];
      const scoreGap = second ? Math.abs(match.score - second.match.score) : 100;
      const competingIssuer = second ? second.company.entityId !== company.entityId : false;
      const ambiguousTop = index === 0 && competingIssuer && scoreGap < 6;
      const confidence = match.score >= 92 && !ambiguousTop ? "high" : match.score >= 70 ? "medium" : "low";
      const primaryCandidate = index === 0 && !ambiguousTop && (match.type.startsWith("exact_") || (match.score >= 82 && scoreGap >= 5));
      const publicCompany: CompanySearchResult = {
        ...company,
        matchType: match.type,
        matchScore: match.score,
        matchConfidence: confidence,
        matchReasons: match.reasons,
        primaryCandidate,
      };
      delete publicCompany.searchAliases;
      return publicCompany;
    });
}
