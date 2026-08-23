import { buildAnalysis, toFinancialAnalysisInput } from "@/lib/analysis/engine";
import { attachInstitutionalResearch } from "@/lib/analysis/research";
import type {
  AnalysisReport,
  AnalysisSource,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile,
  MarketSnapshot,
  ProviderDiagnostic,
} from "@/lib/analysis/types";
import { getMarketDataProvider, isFinancialProviderConfigured } from "@/lib/env/server";
import { searchCompanyCatalog } from "./company-search";
import { fetchCompanyFundamentalsResult } from "./sec";
import { fetchSecSubmissionEvents } from "./sec-submissions";
import { stooqMarketDataProvider } from "./stooq";
import { providerDiagnostic, type AdapterResult, type MarketDataProvider } from "./providers";
import { createTwelveDataMarketProvider, createTwelveDataSearchProvider } from "./twelve-data";

export type ProviderResult<T> =
  | { ok: true; data: T; sources: AnalysisSource[]; warnings: string[] }
  | { ok: false; error: string; sources: AnalysisSource[]; warnings: string[] };

export async function searchCompanies(query: string) {
  const globalProviders = process.env.GLOBAL_SYMBOL_SEARCH_PROVIDER?.trim().toLowerCase() === "twelve_data" && process.env.TWELVE_DATA_API_KEY
    ? [createTwelveDataSearchProvider(process.env.TWELVE_DATA_API_KEY)]
    : [];
  return searchCompanyCatalog(query, globalProviders);
}

type MarketDataResolution = {
  result: AdapterResult<MarketSnapshot>;
  diagnostics: ProviderDiagnostic[];
  source?: Omit<AnalysisSource, "accessedAt">;
};

function unavailableMarketData(): AdapterResult<MarketSnapshot> {
  return {
    ok: false,
    reason: "not_configured",
    message: "Market data is disabled for this deployment.",
    diagnostic: providerDiagnostic("disabled", "market_data", "unavailable", "not_configured"),
  };
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

export async function fetchMarketDataFromProviders(
  company: CompanySearchResult,
  providers: MarketDataProvider[],
): Promise<AdapterResult<MarketSnapshot>> {
  return (await resolveMarketDataFromProviders(company, providers)).result;
}

async function resolveConfiguredMarketData(company: CompanySearchResult): Promise<MarketDataResolution> {
  const primary = getMarketDataProvider();
  const fallback = (process.env.MARKET_DATA_FALLBACK_PROVIDERS ?? "").split(",").map((item) => item.trim().toLowerCase());
  const chain = [...new Set([primary, ...fallback])];
  const providers = chain.flatMap((provider) => {
    if (provider === "stooq") return [stooqMarketDataProvider];
    if (provider === "twelve_data" && process.env.TWELVE_DATA_API_KEY) return [createTwelveDataMarketProvider(process.env.TWELVE_DATA_API_KEY)];
    return [];
  });
  return resolveMarketDataFromProviders(company, providers);
}

export async function fetchConfiguredMarketData(
  company: CompanySearchResult,
): Promise<AdapterResult<MarketSnapshot>> {
  return (await resolveConfiguredMarketData(company)).result;
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

  if (!isFinancialProviderConfigured()) {
    return {
      ok: false,
      error: "Live financial data is not configured for this deployment.",
      sources,
      warnings: ["Financial provider disabled because no SEC contact is configured."]
    };
  }
  if (!company.cik) {
    return {
      ok: false,
      error: "Company found, but the configured fundamentals provider does not currently support this listing.",
      sources,
      warnings: ["The selected listing has no verified fundamentals adapter capability."],
    };
  }

  const deepResearchRequested = analysisType === "deep" || analysisType === "research";
  const [fundamentalsResult, marketResolution, filingsResult] = await Promise.all([
    fetchCompanyFundamentalsResult(company),
    resolveConfiguredMarketData(company),
    deepResearchRequested && company.cik ? fetchSecSubmissionEvents(company) : Promise.resolve(null),
  ]);
  const marketResult = marketResolution.result;
  const fundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;
  const market = marketResult.ok ? marketResult.data : null;
  const providerDiagnostics = [fundamentalsResult.diagnostic, ...marketResolution.diagnostics, ...(filingsResult ? [filingsResult.diagnostic] : [])];

  if (fundamentals) {
    for (const sourceCik of fundamentals.sourceCiks ?? [fundamentals.cik].filter(Boolean) as string[]) {
      sources.push({
        name: `SEC Companyfacts CIK ${sourceCik}`,
        url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${sourceCik}.json`,
        accessedAt,
        freshness: "SEC XBRL facts, cached up to 12 hours."
      });
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
