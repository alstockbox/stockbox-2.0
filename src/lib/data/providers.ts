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

const TRANSIENT_PROVIDER_FAILURES = new Set<ProviderFailureReason>([
  "timeout",
  "rate_limited",
  "upstream_error",
]);

export function shouldRetryProviderFailure(reason: ProviderFailureReason): boolean {
  return TRANSIENT_PROVIDER_FAILURES.has(reason);
}

export type ProviderRetryExecution<T> = {
  result: AdapterResult<T>;
  attempts: AdapterResult<T>[];
};

export async function executeProviderWithRetry<T>({
  operation,
  exceptionResult,
  retryDelayMs,
}: {
  operation: () => Promise<AdapterResult<T>>;
  exceptionResult: () => AdapterResult<T>;
  retryDelayMs?: number;
}): Promise<ProviderRetryExecution<T>> {
  const attempts: AdapterResult<T>[] = [];
  const maxAttempts = 2;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    let result: AdapterResult<T>;
    try {
      result = await operation();
    } catch {
      result = exceptionResult();
    }
    attempts.push(result);

    if (result.ok || !shouldRetryProviderFailure(result.reason) || attemptIndex === maxAttempts - 1) {
      return { result, attempts };
    }

    const delay = retryDelayMs ?? (result.reason === "rate_limited" ? 750 : 150);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const result = attempts.at(-1);
  if (!result) throw new Error("Provider retry execution produced no attempts.");
  return { result, attempts };
}

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
