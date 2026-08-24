import type { CompanySearchResult } from "@/lib/analysis/types";

export type ListedSecurityType = NonNullable<CompanySearchResult["securityType"]>;

export type SecurityMasterVenue =
  | "NASDAQ_STOCKHOLM_MAIN"
  | "NASDAQ_FIRST_NORTH_STOCKHOLM"
  | "SPOTLIGHT"
  | "NGM_MAIN_REGULATED"
  | "NGM_GROWTH_NORDIC_SME";

export type AnalysisCapability = {
  fundamentals: "full" | "partial" | "unavailable";
  marketData: "available" | "unavailable";
  reason?: string;
};

export type ListedSecurity = {
  securityId: string;
  issuerId: string;
  ticker: string;
  canonicalTicker: string;
  localTicker: string;
  providerTickers: string[];
  name: string;
  issuerName: string;
  isin?: string;
  figi?: string;
  lei?: string;
  exchange: string;
  mic: string;
  venue: SecurityMasterVenue;
  marketSegment: string;
  country: string;
  currency: string;
  securityType: ListedSecurityType;
  primarySecurity: boolean;
  primaryListing: boolean;
  analysisCapability: AnalysisCapability;
  aliases: string[];
  source: string;
  sourceUrl?: string;
  sourceUpdatedAt: string;
};

export type SecurityMasterSourceMetadata = {
  providerId: string;
  sourceName: string;
  sourceUrls: string[];
  refreshMode: "configured_feed" | "seeded_release_snapshot";
  refreshedAt: string;
  notes: string[];
  expectedVenueCounts?: Partial<Record<SecurityMasterVenue, number>>;
};

export type SecurityMasterRefreshResult = {
  securities: ListedSecurity[];
  metadata: SecurityMasterSourceMetadata;
};

export interface SecurityMasterProvider {
  readonly id: string;
  readonly supportedMarkets: SecurityMasterVenue[];
  listSecurities(): Promise<ListedSecurity[]>;
  refresh(): Promise<SecurityMasterRefreshResult>;
  sourceMetadata(): SecurityMasterSourceMetadata;
}

export type SecurityMasterQaReport = {
  providerId: string;
  generatedAt: string;
  sourceRefreshedAt: string | null;
  sourceAgeDays: number | null;
  activeSecuritiesByVenue: Record<SecurityMasterVenue, number>;
  activeSecuritiesBySecurityType: Record<string, number>;
  duplicateSecurityIds: string[];
  duplicateIsins: Array<{ isin: string; securityIds: string[] }>;
  missingTickers: string[];
  missingNames: string[];
  ambiguousPrimaryListings: string[];
  tickerCollisions: Array<{ normalizedTicker: string; securityIds: string[] }>;
  catastrophicShrinkage: Array<{ venue: SecurityMasterVenue; expectedAtLeast: number; actual: number }>;
};
