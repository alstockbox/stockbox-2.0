import type { CompanySearchResult } from "@/lib/analysis/types";
import { commonCompanies } from "./common-companies";
import { entityIdentityFor } from "./entity-identities";
import { fetchSecTickerUniverse } from "./sec";
import { providerDiagnostic, type AdapterResult, type CompanySearchProvider, type ProviderCapabilities } from "./providers";
import { securityMasterCompanySearchProvider } from "./security-master";
import { normalizeText as normalizeSecurityText, normalizeTicker as normalizeSecurityTicker } from "./security-master/normalization";

const SEARCH_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["global"],
  supportedExchanges: ["catalog dependent"],
  supportsFundamentals: false,
  supportsMarketData: false,
  supportsEstimates: false,
};

function normalizedText(value: string): string {
  return normalizeSecurityText(value);
}

export function normalizedTicker(value: string): string {
  return normalizeSecurityTicker(value);
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
    entityId: identity?.canonicalId ?? company.entityId ?? company.issuerId ?? (cik ? `sec:${cik}` : `listing:${company.country ?? "unknown"}:${company.ticker.toUpperCase()}`),
    securityType: type,
    primarySecurity: company.primarySecurity ?? type === "Common Stock",
    providerCapabilities: {
      fundamentals: fundamentalsSupported,
      marketData: company.providerCapabilities?.marketData ?? (provider.capabilities.supportsMarketData || company.country === "US"),
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
  specificity: MatchSpecificity;
  explicitLocationIntent: boolean;
  reasons: string[];
};

type MatchSpecificity = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MATCH_SPECIFICITY = {
  exactRawCanonical: 0,
  exactRawProvider: 1,
  exactExchangeAwareProvider: 2,
  exactAliasOrName: 3,
  normalizedTicker: 4,
  nameCoverage: 5,
  typo: 6,
} as const satisfies Record<string, MatchSpecificity>;

const SECURITY_QUERY_WORDS = new Set(["preferred", "preference", "pfd", "adr", "etf", "fund", "common", "stock", "shares", "share", "class"]);
const MATCH_SCORE_CEILINGS: Record<NonNullable<CompanySearchResult["matchType"]>, number> = {
  exact_canonical_ticker: 100,
  exact_provider_ticker: 100,
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

function marketSuffix(value: string): string | null {
  const match = value.trim().toUpperCase().match(/\.([A-Z]{2,5}|T)$/);
  return match?.[1] ?? null;
}

function hasExchangeQualifiedTicker(value: string): boolean {
  return marketSuffix(value) !== null;
}

function canonicalTickerHasVerifiedIdentity(company: CompanySearchResult, ticker: string): boolean {
  return Boolean(company.securityId || company.cik || hasExchangeQualifiedTicker(ticker));
}

function queryHasExplicitLocationIntent(
  company: CompanySearchResult,
  query: string,
  rawTickerCandidates: Set<string>,
): boolean {
  const rawQuery = query.trim().toUpperCase();
  const suffix = marketSuffix(rawQuery);
  if (suffix === "ST" || suffix === "SS") {
    return company.country === "SE"
      || company.mic === "XSTO"
      || normalizedText(company.exchange ?? "").includes("stockholm")
      || rawTickerCandidates.has(rawQuery);
  }
  if (suffix && rawTickerCandidates.has(rawQuery)) return true;
  const queryText = normalizedText(query);
  return [company.exchange, company.country, company.mic, company.marketSegment]
    .filter(Boolean)
    .some((value) => queryText.includes(normalizedText(value as string)));
}

function securityIdentityRank(company: CompanySearchResult): number {
  if (company.securityId) return 4;
  if (company.isin || company.figi || company.lei) return 3;
  if (company.cik) return 2;
  if (company.entityId) return 1;
  return 0;
}

function providerCoverageRank(company: CompanySearchResult): number {
  return Number(Boolean(company.providerCapabilities?.fundamentals)) * 2
    + Number(Boolean(company.providerCapabilities?.marketData));
}

export function scoreSearchMatch(company: CompanySearchResult, query: string): SearchMatch | null {
  const rawQuery = query.trim().toUpperCase();
  const ticker = (company.canonicalTicker ?? company.ticker).toUpperCase();
  const tickerCandidates = [
    company.canonicalTicker ?? company.ticker,
    company.ticker,
    company.localTicker,
    ...(company.providerTickers ?? []),
  ].filter((value): value is string => Boolean(value));
  const rawTickerCandidates = new Set(tickerCandidates.map((value) => value.toUpperCase()));
  const rawProviderTickerCandidates = new Set([
    company.ticker,
    company.localTicker,
    ...(company.providerTickers ?? []),
  ].filter((value): value is string => Boolean(value)).map((value) => value.toUpperCase()));
  const normalizedTickerCandidates = new Set(tickerCandidates.map(normalizedTicker).filter(Boolean));
  const normalizedQueryTicker = normalizedTicker(query);
  const normalizedCompanyTicker = normalizedTicker(ticker);
  const queryText = normalizedText(query);
  const name = normalizedText(company.name);
  const aliases = [
    ...(company.searchAliases ?? []),
    company.localTicker,
    ...(company.providerTickers ?? []),
  ].filter((value): value is string => Boolean(value)).map(normalizedText);
  const preferredIntent = requestedPreferred(query);
  const adrIntent = requestedAdr(query);
  const exactCanonical = rawQuery === ticker;
  const exactProvider = rawTickerCandidates.has(rawQuery);
  const issuerRootTickerMatch = normalizedQueryTicker.length >= 2
    && normalizedCompanyTicker.startsWith(normalizedQueryTicker)
    && normalizedQueryTicker !== normalizedCompanyTicker;
  let match: SearchMatch | null = null;
  if (exactCanonical) {
    match = {
      score: 100,
      type: "exact_canonical_ticker",
      specificity: canonicalTickerHasVerifiedIdentity(company, ticker)
        ? MATCH_SPECIFICITY.exactRawCanonical
        : MATCH_SPECIFICITY.exactRawProvider,
      explicitLocationIntent: false,
      reasons: ["Exact canonical ticker"],
    };
  } else if (exactProvider) {
    match = {
      score: 99,
      type: "exact_provider_ticker",
      specificity: hasExchangeQualifiedTicker(rawQuery) && rawProviderTickerCandidates.has(rawQuery)
        ? MATCH_SPECIFICITY.exactExchangeAwareProvider
        : MATCH_SPECIFICITY.exactRawProvider,
      explicitLocationIntent: false,
      reasons: ["Exact provider ticker"],
    };
  } else if (normalizedQueryTicker && (normalizedQueryTicker === normalizedCompanyTicker || normalizedTickerCandidates.has(normalizedQueryTicker))) {
    match = {
      score: 98,
      type: "exact_canonical_ticker",
      specificity: MATCH_SPECIFICITY.normalizedTicker,
      explicitLocationIntent: false,
      reasons: ["Normalized security ticker match"],
    };
  } else if (aliases.some((alias) => alias === queryText)) {
    match = {
      score: 96,
      type: "exact_alias",
      specificity: MATCH_SPECIFICITY.exactAliasOrName,
      explicitLocationIntent: false,
      reasons: ["Exact known alias"],
    };
  } else if (name === queryText) {
    match = {
      score: 94,
      type: "exact_company_name",
      specificity: MATCH_SPECIFICITY.exactAliasOrName,
      explicitLocationIntent: false,
      reasons: ["Exact normalized company name"],
    };
  } else if (name.startsWith(queryText)) {
    match = {
      score: 86,
      type: "company_name_prefix",
      specificity: MATCH_SPECIFICITY.nameCoverage,
      explicitLocationIntent: false,
      reasons: ["Company-name prefix"],
    };
  }
  const tokens = queryTokens(query);
  const searchableTokens = new Set([name, ...aliases].join(" ").split(" "));
  const tokenCoverage = tokens.length ? tokens.filter((token) => searchableTokens.has(token)).length / tokens.length : 0;
  if (!match && tokenCoverage > 0) {
    match = {
      score: 60 + tokenCoverage * 20,
      type: "token_coverage",
      specificity: MATCH_SPECIFICITY.nameCoverage,
      explicitLocationIntent: false,
      reasons: [`${Math.round(tokenCoverage * 100)}% query-token coverage`],
    };
  }
  const securityRoot = normalizedTicker(tokens[0] ?? "");
  if (!match && preferredIntent && securityRoot && normalizedCompanyTicker.startsWith(securityRoot)) {
    match = {
      score: 82,
      type: "token_coverage",
      specificity: MATCH_SPECIFICITY.nameCoverage,
      explicitLocationIntent: false,
      reasons: ["Issuer ticker and preferred-security intent matched"],
    };
  }
  if (!match && issuerRootTickerMatch && company.securityType === "Preferred") {
    match = {
      score: 91,
      type: "token_coverage",
      specificity: MATCH_SPECIFICITY.nameCoverage,
      explicitLocationIntent: false,
      reasons: ["Issuer ticker matched security family"],
    };
  }
  const compactName = name.replace(/\s/g, "");
  const compactQuery = queryText.replace(/\s/g, "");
  const tickerDistance = editDistance(normalizedQueryTicker.toLowerCase(), normalizedCompanyTicker.toLowerCase());
  const nameDistance = editDistance(compactQuery, compactName.slice(0, compactQuery.length));
  if (!match && compactQuery.length >= 3 && tickerDistance <= 2) {
    match = {
      score: 74 - tickerDistance * 4,
      type: "ticker_typo",
      specificity: MATCH_SPECIFICITY.typo,
      explicitLocationIntent: false,
      reasons: [`Ticker typo distance ${tickerDistance}`],
    };
  }
  if (!match && compactQuery.length >= 4 && nameDistance <= 2) {
    match = {
      score: 70 - nameDistance * 4,
      type: "name_typo",
      specificity: MATCH_SPECIFICITY.typo,
      explicitLocationIntent: false,
      reasons: [`Name typo distance ${nameDistance}`],
    };
  }
  if (!match) return null;

  const explicitSecurityTicker = match.type === "exact_canonical_ticker" || match.type === "exact_provider_ticker";
  if (company.securityType === "Preferred") {
    if (preferredIntent) { match.score += 14; match.reasons.push("Preferred security requested"); }
    else if (issuerRootTickerMatch) { match.score -= 8; match.reasons.push("Preferred security shown below common stock"); }
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

  const explicitLocation = queryHasExplicitLocationIntent(company, query, rawTickerCandidates);
  match.explicitLocationIntent = explicitLocation;
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
  const providers = [...configuredCatalogProviders, securityMasterCompanySearchProvider, curatedCompanySearchProvider, secCompanySearchProvider];
  const providerResults = await Promise.all(providers.map((provider) => provider.search(normalizedQuery)));
  const merged = new Map<string, CompanySearchResult>();
  for (const [providerIndex, result] of providerResults.entries()) {
    if (!result.ok) continue;
    for (const company of result.data) {
      const enriched = enrich(company, providers[providerIndex]);
      const key = enriched.securityId
        ?? `${enriched.entityId ?? `${enriched.country ?? "unknown"}:unknown-issuer`}:${normalizedTicker(enriched.canonicalTicker ?? enriched.ticker)}:${enriched.securityType}`;
      merged.set(key, mergeCompany(merged.get(key), enriched));
    }
  }
  return [...merged.values()]
    .flatMap((company) => {
      const match = scoreSearchMatch(company, normalizedQuery);
      return match ? [{ company, match }] : [];
    })
    .sort((left, right) =>
      left.match.specificity - right.match.specificity
      || right.match.score - left.match.score
      || Number(right.match.explicitLocationIntent) - Number(left.match.explicitLocationIntent)
      || securityIdentityRank(right.company) - securityIdentityRank(left.company)
      || Number(Boolean(right.company.primarySecurity)) - Number(Boolean(left.company.primarySecurity))
      || providerCoverageRank(right.company) - providerCoverageRank(left.company)
      || left.company.name.localeCompare(right.company.name)
    )
    .slice(0, 20)
    .map(({ company, match }, index, ranked) => {
      const second = ranked[index === 0 ? 1 : 0];
      const scoreGap = second ? Math.abs(match.score - second.match.score) : 100;
      const specificityGap = second ? second.match.specificity - match.specificity : 7;
      const competingIssuer = second ? second.company.entityId !== company.entityId : false;
      const ambiguousTop = index === 0 && competingIssuer && scoreGap < 6 && specificityGap === 0;
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
