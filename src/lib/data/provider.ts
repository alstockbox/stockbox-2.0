import { buildAnalysis } from "@/lib/analysis/engine";
import type {
  AnalysisReport,
  AnalysisSource,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile,
  MarketSnapshot
} from "@/lib/analysis/types";
import { getMarketDataProvider, isFinancialProviderConfigured } from "@/lib/env/server";
import { searchCompanyCatalog } from "./company-search";
import { fetchCompanyFundamentalsResult } from "./sec";
import { fetchStooqMarketData, mapStooqSymbol } from "./stooq";
import { providerDiagnostic, type AdapterResult } from "./providers";

export type ProviderResult<T> =
  | { ok: true; data: T; sources: AnalysisSource[]; warnings: string[] }
  | { ok: false; error: string; sources: AnalysisSource[]; warnings: string[] };

export async function searchCompanies(query: string) {
  return searchCompanyCatalog(query);
}

export async function fetchConfiguredMarketData(
  company: CompanySearchResult,
): Promise<AdapterResult<MarketSnapshot>> {
  const selectedProvider = getMarketDataProvider();
  if (selectedProvider === "stooq") return fetchStooqMarketData(company);
  return {
    ok: false,
    reason: "not_configured",
    message: "Market data is disabled for this deployment.",
    diagnostic: providerDiagnostic("disabled", "market_data", "unavailable", "not_configured"),
  };
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

  const [fundamentalsResult, marketResult] = await Promise.all([
    fetchCompanyFundamentalsResult(company),
    fetchConfiguredMarketData(company)
  ]);
  const fundamentals = fundamentalsResult.ok ? fundamentalsResult.data : null;
  const market = marketResult.ok ? marketResult.data : null;
  const providerDiagnostics = [fundamentalsResult.diagnostic, marketResult.diagnostic];

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

  if (market && marketResult.diagnostic.provider === "Stooq") {
    sources.push({
      name: "Stooq end-of-day market data",
      url: `https://stooq.com/q/d/l/?s=${encodeURIComponent(mapStooqSymbol(company)?.symbol ?? company.ticker.toLowerCase())}&i=d`,
      accessedAt,
      freshness: "End-of-day market data, cached up to 15 minutes."
    });
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
  report.score.missingData = [...new Set([...report.score.missingData, ...warnings])];

  return {
    ok: true,
    data: report,
    sources,
    warnings
  };
}
