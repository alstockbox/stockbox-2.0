import { buildAnalysis, toFinancialAnalysisInput } from "@/lib/analysis/engine";
import { attachInstitutionalResearch } from "@/lib/analysis/research";
import type {
  AnalysisReport,
  AnalysisSource,
  AnalysisType,
  CompanyFundamentals,
  CompanySearchResult,
  InvestmentProfile,
  MarketSnapshot,
  ProviderDiagnostic,
} from "@/lib/analysis/types";
import { getMarketDataProviderChain, getServerEnv, type ServerEnv } from "@/lib/env/server";
import { searchCompanyCatalog } from "./company-search";
import { fetchCompanyFundamentalsResult } from "./sec";
import { fetchSecSubmissionEvents } from "./sec-submissions";
import { stooqMarketDataProvider } from "./stooq";
import { providerDiagnostic, type AdapterResult, type MarketDataProvider, type ProviderFailureReason } from "./providers";
import { createTwelveDataMarketProvider, createTwelveDataSearchProvider } from "./twelve-data";
import { yahooMarketDataProvider } from "./yahoo-market";
import { fetchYahooFundamentalsResult, yahooCompanySearchProvider, yahooSymbolForCompany } from "./yahoo-fundamentals";

export type ProviderResult<T> =
  | { ok: true; data: T; sources: AnalysisSource[]; warnings: string[] }
  | { ok: false; error: string; sources: AnalysisSource[]; warnings: string[] };

type FundamentalsResolution = {
  result: AdapterResult<CompanyFundamentals>;
  diagnostics: ProviderDiagnostic[];
  source?: Omit<AnalysisSource, "accessedAt">;
};

function yahooFundamentalsSource(company: CompanySearchResult): Omit<AnalysisSource, "accessedAt"> {
  const symbol = yahooSymbolForCompany(company);
  return {
    name: "Yahoo Finance reported fundamentals",
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/financials/`,
    freshness: "Reported annual, quarterly and trailing fundamentals, cached up to 30 minutes.",
  };
}

function hasUsableFinancialPeriods(fundamentals: CompanyFundamentals): boolean {
  return Boolean(
    fundamentals.trailingTwelveMonths
    || fundamentals.annualPeriods?.length
    || fundamentals.annual.length,
  );
}

async function resolveConfiguredFundamentals(company: CompanySearchResult): Promise<FundamentalsResolution> {
  const diagnostics: ProviderDiagnostic[] = [];
  if (company.cik) {
    let secResult: AdapterResult<CompanyFundamentals>;
    try {
      secResult = await fetchCompanyFundamentalsResult(company);
    } catch {
      secResult = { ok: false, reason: "upstream_error", message: "SEC fundamentals failed unexpectedly.", diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "upstream_error") };
    }
    if (secResult.ok && hasUsableFinancialPeriods(secResult.data)) {
      diagnostics.push(secResult.diagnostic);
      return { result: secResult, diagnostics };
    }
    diagnostics.push(secResult.ok
      ? providerDiagnostic("SEC Companyfacts", "fundamentals", "partial", "empty_response")
      : secResult.diagnostic);
  }
  let yahooResult: AdapterResult<CompanyFundamentals>;
  try {
    yahooResult = await fetchYahooFundamentalsResult(company);
  } catch {
    yahooResult = { ok: false, reason: "upstream_error", message: "Yahoo fundamentals failed unexpectedly.", diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", "upstream_error") };
  }
  diagnostics.push(yahooResult.diagnostic);
  return { result: yahooResult, diagnostics, source: yahooResult.ok ? yahooFundamentalsSource(company) : undefined };
}

export async function searchCompanies(query: string) {
  const globalProviders = [yahooCompanySearchProvider];
  if (process.env.GLOBAL_SYMBOL_SEARCH_PROVIDER?.trim().toLowerCase() === "twelve_data" && process.env.TWELVE_DATA_API_KEY) {
    globalProviders.unshift(createTwelveDataSearchProvider(process.env.TWELVE_DATA_API_KEY));
  }
  return searchCompanyCatalog(query, globalProviders);
}

type MarketDataResolution = {
  result: AdapterResult<MarketSnapshot>;
  diagnostics: ProviderDiagnostic[];
  source?: Omit<AnalysisSource, "accessedAt">;
};

type ConfiguredMarketProviderKey = "twelve_data" | "stooq" | "yahoo";

type MarketDataProviderCandidate = {
  key: ConfiguredMarketProviderKey;
  providerId: string;
  label: string;
  configured: boolean;
  reason?: ProviderFailureReason;
  message?: string;
  provider?: MarketDataProvider;
};

export type MarketDataProviderStatus = {
  key: ConfiguredMarketProviderKey;
  providerId: string;
  label: string;
  configured: boolean;
  reason?: ProviderFailureReason;
};

export type MarketDataSmokeResult = {
  symbol: string;
  status: "available" | "unavailable";
  attemptedProviders: Array<{
    provider: string;
    status: ProviderDiagnostic["status"];
    reason?: string;
  }>;
  resolvedProvider: string | null;
  reason: string | null;
  priceDate: string | null;
  historyLength: number | null;
  momentum3MAvailable: boolean;
  momentum1YAvailable: boolean;
  betaAvailable: boolean;
  marketCapAvailable: boolean;
  observedAt: string;
};

function unavailableMarketData(): AdapterResult<MarketSnapshot> {
  return {
    ok: false,
    reason: "not_configured",
    message: "Market data is disabled for this deployment.",
    diagnostic: providerDiagnostic("disabled", "market_data", "unavailable", "not_configured"),
  };
}

function unconfiguredMarketData(candidate: MarketDataProviderCandidate): AdapterResult<MarketSnapshot> {
  return {
    ok: false,
    reason: candidate.reason ?? "not_configured",
    message: candidate.message ?? `${candidate.label} is not configured for this deployment.`,
    diagnostic: providerDiagnostic(candidate.label, "market_data", "unavailable", candidate.reason ?? "not_configured"),
  };
}

function configuredMarketDataProviderCandidates(env: ServerEnv = getServerEnv()): MarketDataProviderCandidate[] {
  return getMarketDataProviderChain(env).map((key) => {
    if (key === "stooq") {
      return {
        key,
        providerId: stooqMarketDataProvider.id,
        label: "Stooq",
        configured: true,
        provider: stooqMarketDataProvider,
      };
    }

    if (key === "yahoo") {
      return {
        key,
        providerId: yahooMarketDataProvider.id,
        label: "Yahoo Finance chart",
        configured: true,
        provider: yahooMarketDataProvider,
      };
    }

    if (env.TWELVE_DATA_API_KEY?.trim()) {
      return {
        key,
        providerId: "twelve-data",
        label: "Twelve Data",
        configured: true,
        provider: createTwelveDataMarketProvider(env.TWELVE_DATA_API_KEY),
      };
    }

    return {
      key,
      providerId: "twelve-data",
      label: "Twelve Data",
      configured: false,
      reason: "not_configured",
      message: "Twelve Data is listed in the market-data provider chain but TWELVE_DATA_API_KEY is not configured.",
    };
  });
}

export function configuredMarketDataProviderStatuses(env: ServerEnv = getServerEnv()): MarketDataProviderStatus[] {
  return configuredMarketDataProviderCandidates(env).map((candidate) => ({
    key: candidate.key,
    providerId: candidate.providerId,
    label: candidate.label,
    configured: candidate.configured,
    reason: candidate.reason,
  }));
}

async function resolveMarketDataFromProviders(
  company: CompanySearchResult,
  providers: MarketDataProvider[],
): Promise<MarketDataResolution> {
  if (!providers.length) {
    const result = unavailableMarketData();
    return { result, diagnostics: [result.diagnostic] };
  }
  const diagnostics: ProviderDiagnostic[] = [];
  let lastResult: AdapterResult<MarketSnapshot> = unavailableMarketData();
  for (const provider of providers) {
    let result: AdapterResult<MarketSnapshot>;
    try {
      result = await provider.fetchMarketData(company);
    } catch {
      result = {
        ok: false,
        reason: "upstream_error",
        message: "The configured market-data provider failed unexpectedly.",
        diagnostic: providerDiagnostic(provider.id, "market_data", "unavailable", "upstream_error"),
      };
      console.error("Market data provider failed unexpectedly", {
        resolvedProvider: provider.id,
        symbol: company.canonicalTicker ?? company.ticker,
        reason: "upstream_error",
      });
    }
    diagnostics.push(result.diagnostic);
    if (result.ok) {
      return {
        result,
        diagnostics,
        source: provider.source?.(company),
      };
    }
    lastResult = result;
  }
  return { result: lastResult, diagnostics };
}

async function resolveMarketDataFromCandidates(
  company: CompanySearchResult,
  candidates: MarketDataProviderCandidate[],
): Promise<MarketDataResolution> {
  if (!candidates.length) {
    const result = unavailableMarketData();
    return { result, diagnostics: [result.diagnostic] };
  }

  const diagnostics: ProviderDiagnostic[] = [];
  let lastResult: AdapterResult<MarketSnapshot> = unavailableMarketData();
  let lastConfiguredResult: AdapterResult<MarketSnapshot> | null = null;

  for (const candidate of candidates) {
    if (!candidate.configured || !candidate.provider) {
      const result = unconfiguredMarketData(candidate);
      diagnostics.push(result.diagnostic);
      lastResult = result;
      continue;
    }

    let result: AdapterResult<MarketSnapshot>;
    try {
      result = await candidate.provider.fetchMarketData(company);
    } catch {
      result = {
        ok: false,
        reason: "upstream_error",
        message: "The configured market-data provider failed unexpectedly.",
        diagnostic: providerDiagnostic(candidate.label, "market_data", "unavailable", "upstream_error"),
      };
      console.error("Market data provider failed unexpectedly", {
        resolvedProvider: candidate.provider.id,
        symbol: company.canonicalTicker ?? company.ticker,
        reason: "upstream_error",
      });
    }
    diagnostics.push(result.diagnostic);
    lastResult = result;
    lastConfiguredResult = result;
    if (result.ok) {
      return {
        result,
        diagnostics,
        source: candidate.provider.source?.(company),
      };
    }
  }

  return { result: lastConfiguredResult ?? lastResult, diagnostics };
}

export async function fetchMarketDataFromProviders(
  company: CompanySearchResult,
  providers: MarketDataProvider[],
): Promise<AdapterResult<MarketSnapshot>> {
  return (await resolveMarketDataFromProviders(company, providers)).result;
}

async function resolveConfiguredMarketData(company: CompanySearchResult): Promise<MarketDataResolution> {
  return resolveMarketDataFromCandidates(company, configuredMarketDataProviderCandidates());
}

export async function fetchConfiguredMarketData(
  company: CompanySearchResult,
): Promise<AdapterResult<MarketSnapshot>> {
  return (await resolveConfiguredMarketData(company)).result;
}

const MARKET_DATA_SMOKE_SYMBOLS = ["AAPL", "MSFT", "NVDA", "SPY"];

function smokeCompany(symbol: string): CompanySearchResult {
  return {
    ticker: symbol,
    canonicalTicker: symbol,
    name: symbol,
    exchange: symbol === "SPY" ? "NYSE Arca" : "NASDAQ",
    country: "US",
    currency: "USD",
    providerCapabilities: {
      fundamentals: false,
      marketData: true,
      providerIds: [],
    },
  };
}

export async function smokeConfiguredMarketData(
  symbols: string[] = MARKET_DATA_SMOKE_SYMBOLS,
): Promise<MarketDataSmokeResult[]> {
  return Promise.all(symbols.map(async (symbol) => {
    const resolution = await resolveConfiguredMarketData(smokeCompany(symbol));
    const market = resolution.result.ok ? resolution.result.data : null;
    const latestDiagnostic = resolution.diagnostics.at(-1) ?? resolution.result.diagnostic;
    return {
      symbol,
      status: resolution.result.ok ? "available" : "unavailable",
      attemptedProviders: resolution.diagnostics.map((diagnostic) => ({
        provider: diagnostic.provider,
        status: diagnostic.status,
        reason: diagnostic.reason,
      })),
      resolvedProvider: market?.provider ?? (resolution.result.ok ? resolution.result.diagnostic.provider : null),
      reason: resolution.result.ok ? null : resolution.result.reason,
      priceDate: market?.date ?? null,
      historyLength: market?.historyLength ?? null,
      momentum3MAvailable: market?.performance["3M"] !== undefined,
      momentum1YAvailable: market?.performance["1Y"] !== undefined,
      betaAvailable: market?.beta !== undefined && market.beta !== null,
      marketCapAvailable: market?.marketCap !== undefined && market.marketCap !== null,
      observedAt: latestDiagnostic.observedAt,
    };
  }));
}

function enrichMarketWithFundamentals(
  company: CompanySearchResult, market: MarketSnapshot | null, fundamentals: CompanyFundamentals | null,
): MarketSnapshot | null {
  if (!market || !fundamentals) return market;
  const marketCurrency = market.currency?.toUpperCase() ?? null;
  const capCurrency = fundamentals.reportedMarketCapCurrency?.toUpperCase() ?? null;
  const capDate = fundamentals.reportedMarketCapDate;
  const capDateUsable = !capDate || Date.parse(`${capDate}T00:00:00Z`) <= Date.now() + 86_400_000;
  const marketCap = market.marketCap ?? (marketCurrency && capCurrency && marketCurrency === capCurrency && capDateUsable
    ? fundamentals.reportedMarketCap ?? null : null);
  const commonEquity = !company.securityType || company.securityType === "Common Stock";
  const sharesOutstanding = market.sharesOutstanding ?? (commonEquity ? fundamentals.reportedSharesOutstanding ?? null : null);
  return { ...market, marketCap, sharesOutstanding };
}

export async function analyzeCompany({
  company,
  analysisType,
  investmentProfile
}: {
  company: CompanySearchResult;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
}): Promise<ProviderResult<AnalysisReport>> {
  const accessedAt = new Date().toISOString();
  const sources: AnalysisSource[] = [];
  const warnings: string[] = [];

  const deepResearchRequested = analysisType === "deep" || analysisType === "research";
  const [fundamentalsResolution, marketResolution, filingsResult] = await Promise.all([
    resolveConfiguredFundamentals(company),
    resolveConfiguredMarketData(company),
    deepResearchRequested && company.cik ? fetchSecSubmissionEvents(company) : Promise.resolve(null),
  ]);
  const fundamentalsResult = fundamentalsResolution.result;
  const marketResult = marketResolution.result;
  const fundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;
  const rawMarket = marketResult.ok ? marketResult.data : null;
  const market = enrichMarketWithFundamentals(company, rawMarket, fundamentals);
  const providerDiagnostics = [...fundamentalsResolution.diagnostics, ...marketResolution.diagnostics, ...(filingsResult ? [filingsResult.diagnostic] : [])];

  if (fundamentals) {
    const secCiks = fundamentals.sourceCiks ?? (fundamentals.cik ? [fundamentals.cik] : []);
    for (const sourceCik of secCiks) {
      sources.push({ name: `SEC Companyfacts CIK ${sourceCik}`, url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${sourceCik}.json`, accessedAt, freshness: "SEC XBRL facts, cached up to 12 hours." });
    }
    if (!secCiks.length && fundamentalsResolution.source) {
      sources.push({ ...fundamentalsResolution.source, accessedAt });
    }
  } else {
    warnings.push(`Fundamental data is unavailable: ${fundamentalsResult.ok ? "unknown provider error" : fundamentalsResult.message}`);
  }

  if (market) {
    if (marketResolution.source) {
      sources.push({
        ...marketResolution.source,
        accessedAt,
      });
    }
  } else {
    warnings.push(`Market price history is unavailable: ${marketResult.ok ? "unknown provider error" : marketResult.message}`);
  }

  if (!fundamentals && !market) {
    return {
      ok: false,
      error: "No live financial or market data could be retrieved for this company.",
      sources,
      warnings
    };
  }

  const report = buildAnalysis({
    company,
    market,
    fundamentals,
    analysisType,
    investmentProfile,
    providerDiagnostics
  });
  report.sources = sources;
  if (report.engine) {
    const canonicalInput = toFinancialAnalysisInput({ company, market, fundamentals, analysisType, investmentProfile, providerDiagnostics });
    const filings = filingsResult?.ok ? {
      status: "available" as const,
      events: filingsResult.data.data,
      evidence: filingsResult.data.evidence,
      dataAsOf: filingsResult.data.dataAsOf,
      coverage: filingsResult.data.coverage,
      confidence: filingsResult.data.confidence,
    } : filingsResult ? {
      status: filingsResult.diagnostic.status === "unsupported" ? "unsupported" as const : "unavailable" as const,
      events: [],
      evidence: [],
      dataAsOf: null,
      coverage: 0,
      confidence: 0,
      reason: filingsResult.message,
    } : undefined;
    attachInstitutionalResearch(report, report.engine, canonicalInput, { market, filings });
  }
  report.score.missingData = [...new Set([...report.score.missingData, ...warnings])];

  return {
    ok: true,
    data: report,
    sources,
    warnings
  };
}
