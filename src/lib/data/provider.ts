import { buildAnalysis } from "@/lib/analysis/engine";
import type {
  AnalysisReport,
  AnalysisSource,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile
} from "@/lib/analysis/types";
import { isFinancialProviderConfigured } from "@/lib/env/server";
import { fetchCompanyFundamentals, searchCompanies as searchSecCompanies } from "./sec";
import { fetchMarketSnapshot } from "./stooq";

export type ProviderResult<T> =
  | { ok: true; data: T; sources: AnalysisSource[]; warnings: string[] }
  | { ok: false; error: string; sources: AnalysisSource[]; warnings: string[] };

export async function searchCompanies(query: string) {
  return searchSecCompanies(query);
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

  const [fundamentals, market] = await Promise.all([
    fetchCompanyFundamentals(company),
    fetchMarketSnapshot(company.ticker)
  ]);

  if (fundamentals) {
    sources.push({
      name: "SEC Companyfacts",
      url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${fundamentals.cik}.json`,
      accessedAt,
      freshness: "SEC XBRL facts, cached up to 12 hours."
    });
  } else {
    warnings.push("Fundamental data is unavailable for this company.");
  }

  if (market) {
    sources.push({
      name: "Stooq end-of-day market data",
      url: `https://stooq.com/q/d/l/?s=${company.ticker.toLowerCase()}.us&i=d`,
      accessedAt,
      freshness: "End-of-day market data, cached up to 15 minutes."
    });
  } else {
    warnings.push("Market price history is unavailable for this ticker.");
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
    investmentProfile
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
