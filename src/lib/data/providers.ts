import type {
  CompanyFundamentals,
  CompanySearchResult,
  MarketSnapshot,
  ProviderDiagnostic,
  SpecializedCompanyData,
  ResearchEvent,
  ResearchLayerPayload,
} from "@/lib/analysis/types";

export type ProviderCapabilities = {
  supportedCountries: string[];
  supportedExchanges: string[];
  supportsFundamentals: boolean;
  supportsMarketData: boolean;
  supportsEstimates: boolean;
};

export type ProviderFailureReason =
  | "not_configured"
  | "unsupported_symbol"
  | "timeout"
  | "rate_limited"
  | "upstream_error"
  | "empty_response"
  | "unexpected_content_type"
  | "unexpected_columns"
  | "html_response"
  | "invalid_row"
  | "future_date"
  | "impossible_price"
  | "not_found";

export type AdapterResult<T> =
  | { ok: true; data: T; diagnostic: ProviderDiagnostic }
  | { ok: false; reason: ProviderFailureReason; message: string; diagnostic: ProviderDiagnostic };

export interface CompanySearchProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  search(query: string): Promise<AdapterResult<CompanySearchResult[]>>;
}

export interface FundamentalsProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  fetchFundamentals(company: CompanySearchResult): Promise<AdapterResult<CompanyFundamentals>>;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  readonly source?: (company: CompanySearchResult) => {
    name: string;
    url: string;
    freshness: string;
  };
  fetchMarketData(company: CompanySearchResult): Promise<AdapterResult<MarketSnapshot>>;
}

export interface SpecializedDataProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  fetchSpecializedData(company: CompanySearchResult): Promise<AdapterResult<SpecializedCompanyData>>;
}

export interface FilingsEventsProvider {
  readonly id: string;
  fetchFilingsEvents(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload<ResearchEvent[]>>>;
}

export interface NewsEventsProvider {
  readonly id: string;
  fetchNewsEvents(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload>>;
}

export interface EarningsEstimatesProvider {
  readonly id: string;
  fetchEarningsExpectations(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload>>;
}

export interface InsiderOwnershipProvider {
  readonly id: string;
  fetchInsiderOwnership(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload>>;
}

export interface OwnershipProvider {
  readonly id: string;
  fetchOwnership(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload>>;
}

export interface IndustryResearchProvider {
  readonly id: string;
  fetchIndustryContext(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload>>;
}

export interface MacroResearchProvider {
  readonly id: string;
  fetchMacroContext(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload>>;
}

export interface GeopoliticalResearchProvider {
  readonly id: string;
  fetchGeopoliticalContext(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload>>;
}

export interface MarketPositioningProvider {
  readonly id: string;
  fetchMarketPositioning(company: CompanySearchResult): Promise<AdapterResult<ResearchLayerPayload>>;
}

export function providerDiagnostic(
  provider: string,
  capability: ProviderDiagnostic["capability"],
  status: ProviderDiagnostic["status"],
  reason?: string,
): ProviderDiagnostic {
  return { provider, capability, status, reason, observedAt: new Date().toISOString() };
}
