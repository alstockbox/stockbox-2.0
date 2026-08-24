import type { CompanySearchResult } from "@/lib/analysis/types";
import { providerDiagnostic, type AdapterResult, type CompanySearchProvider, type ProviderCapabilities } from "../providers";
import { securitySearchAliases } from "./normalization";
import { swedishListedSecuritySeed, swedishSecuritySourceMetadata } from "./swedish-securities";
import type {
  ListedSecurity,
  SecurityMasterProvider,
  SecurityMasterQaReport,
  SecurityMasterSourceMetadata,
  SecurityMasterVenue,
} from "./types";

const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const SECURITY_MASTER_CAPABILITIES: ProviderCapabilities = {
  supportedCountries: ["SE"],
  supportedExchanges: ["Nasdaq Stockholm", "Nasdaq First North Stockholm", "Spotlight", "NGM"],
  supportsFundamentals: false,
  supportsMarketData: true,
  supportsEstimates: false,
};

const SWEDISH_SOURCE_METADATA = swedishSecuritySourceMetadata;

let cachedSecurities: { expiresAt: number; securities: ListedSecurity[] } | null = null;

export const swedishSecurityMasterProvider: SecurityMasterProvider = {
  id: "swedish-listed-security-master",
  supportedMarkets: [
    "NASDAQ_STOCKHOLM_MAIN",
    "NASDAQ_FIRST_NORTH_STOCKHOLM",
    "SPOTLIGHT",
    "NGM_MAIN_REGULATED",
    "NGM_GROWTH_NORDIC_SME",
  ],
  async listSecurities() {
    const now = Date.now();
    if (cachedSecurities && cachedSecurities.expiresAt > now) return cachedSecurities.securities;
    const securities = [...swedishListedSecuritySeed];
    cachedSecurities = { securities, expiresAt: now + CACHE_TTL_MS };
    return securities;
  },
  async refresh() {
    const securities = [...swedishListedSecuritySeed];
    cachedSecurities = { securities, expiresAt: Date.now() + CACHE_TTL_MS };
    return { securities, metadata: SWEDISH_SOURCE_METADATA };
  },
  sourceMetadata() {
    return SWEDISH_SOURCE_METADATA;
  },
};

export const securityMasterProviders: SecurityMasterProvider[] = [swedishSecurityMasterProvider];

export function listedSecurityToCompanySearchResult(security: ListedSecurity): CompanySearchResult {
  return {
    securityId: security.securityId,
    issuerId: security.issuerId,
    ticker: security.localTicker,
    canonicalTicker: security.canonicalTicker,
    localTicker: security.localTicker,
    providerTickers: security.providerTickers,
    name: security.name,
    exchange: security.exchange,
    mic: security.mic,
    marketSegment: security.marketSegment,
    country: security.country,
    currency: security.currency,
    entityId: security.issuerId,
    isin: security.isin,
    lei: security.lei,
    securityType: security.securityType,
    primarySecurity: security.primarySecurity,
    providerCapabilities: {
      fundamentals: security.analysisCapability.fundamentals !== "unavailable",
      marketData: security.analysisCapability.marketData === "available",
      providerIds: [swedishSecurityMasterProvider.id],
    },
    analysisCapability: security.analysisCapability,
    source: security.source,
    sourceUpdatedAt: security.sourceUpdatedAt,
    searchAliases: securitySearchAliases(security),
  };
}

export const securityMasterCompanySearchProvider: CompanySearchProvider = {
  id: swedishSecurityMasterProvider.id,
  capabilities: SECURITY_MASTER_CAPABILITIES,
  async search(): Promise<AdapterResult<CompanySearchResult[]>> {
    const securities = await swedishSecurityMasterProvider.listSecurities();
    return {
      ok: true,
      data: securities.map(listedSecurityToCompanySearchResult),
      diagnostic: providerDiagnostic("Swedish listed security master", "search", "available"),
    };
  },
};

function duplicateKeys(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function emptyVenueCounts(): Record<SecurityMasterVenue, number> {
  return {
    NASDAQ_STOCKHOLM_MAIN: 0,
    NASDAQ_FIRST_NORTH_STOCKHOLM: 0,
    SPOTLIGHT: 0,
    NGM_MAIN_REGULATED: 0,
    NGM_GROWTH_NORDIC_SME: 0,
  };
}

function sourceAgeDays(refreshedAt: string | null): number | null {
  if (!refreshedAt) return null;
  const refreshed = Date.parse(`${refreshedAt.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(refreshed)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return Math.max(0, Math.floor((today - refreshed) / (1000 * 60 * 60 * 24)));
}

function minimumVenueCountsFromMetadata(
  metadata: SecurityMasterSourceMetadata,
): Partial<Record<SecurityMasterVenue, number>> {
  return Object.fromEntries(
    Object.entries(metadata.expectedVenueCounts ?? {}).map(([venue, count]) => [
      venue,
      Math.max(1, Math.floor((count ?? 0) * 0.95)),
    ]),
  ) as Partial<Record<SecurityMasterVenue, number>>;
}

export function qaSecurityUniverse(
  providerId: string,
  securities: ListedSecurity[],
  minimumVenueCounts: Partial<Record<SecurityMasterVenue, number>> = {},
): SecurityMasterQaReport {
  const activeSecuritiesByVenue = emptyVenueCounts();
  const activeSecuritiesBySecurityType: Record<string, number> = {};
  const isins = new Map<string, string[]>();
  const issuerPrimaryListings = new Map<string, string[]>();
  const tickerCollisions = new Map<string, string[]>();

  for (const security of securities) {
    activeSecuritiesByVenue[security.venue] += 1;
    activeSecuritiesBySecurityType[security.securityType] = (activeSecuritiesBySecurityType[security.securityType] ?? 0) + 1;
    if (security.isin) isins.set(security.isin, [...(isins.get(security.isin) ?? []), security.securityId]);
    if (security.primaryListing) issuerPrimaryListings.set(security.issuerId, [...(issuerPrimaryListings.get(security.issuerId) ?? []), security.securityId]);
    const normalizedTicker = security.providerTickers[0]?.replace(/[^A-Z0-9]/g, "") ?? security.ticker.replace(/[^A-Z0-9]/g, "");
    tickerCollisions.set(normalizedTicker, [...(tickerCollisions.get(normalizedTicker) ?? []), security.securityId]);
  }

  return {
    providerId,
    generatedAt: new Date().toISOString(),
    sourceRefreshedAt: SWEDISH_SOURCE_METADATA.refreshedAt,
    sourceAgeDays: sourceAgeDays(SWEDISH_SOURCE_METADATA.refreshedAt),
    activeSecuritiesByVenue,
    activeSecuritiesBySecurityType,
    duplicateSecurityIds: duplicateKeys(securities.map((security) => security.securityId)),
    duplicateIsins: [...isins.entries()]
      .filter(([, securityIds]) => securityIds.length > 1)
      .map(([isin, securityIds]) => ({ isin, securityIds })),
    missingTickers: securities.filter((security) => !security.ticker.trim()).map((security) => security.securityId),
    missingNames: securities.filter((security) => !security.name.trim()).map((security) => security.securityId),
    ambiguousPrimaryListings: [...issuerPrimaryListings.entries()]
      .filter(([, securityIds]) => securityIds.length > 1)
      .map(([issuerId]) => issuerId),
    tickerCollisions: [...tickerCollisions.entries()]
      .filter(([, securityIds]) => securityIds.length > 1)
      .map(([normalizedTicker, securityIds]) => ({ normalizedTicker, securityIds })),
    catastrophicShrinkage: Object.entries(minimumVenueCounts).flatMap(([venue, expectedAtLeast]) => {
      const typedVenue = venue as SecurityMasterVenue;
      const actual = activeSecuritiesByVenue[typedVenue];
      return expectedAtLeast && actual < expectedAtLeast ? [{ venue: typedVenue, expectedAtLeast, actual }] : [];
    }),
  };
}

export async function qaSwedishSecurityUniverse(): Promise<SecurityMasterQaReport> {
  const securities = await swedishSecurityMasterProvider.listSecurities();
  return qaSecurityUniverse(
    swedishSecurityMasterProvider.id,
    securities,
    minimumVenueCountsFromMetadata(SWEDISH_SOURCE_METADATA),
  );
}

export type {
  ListedSecurity,
  SecurityMasterProvider,
  SecurityMasterQaReport,
  SecurityMasterSourceMetadata,
  SecurityMasterVenue,
};
