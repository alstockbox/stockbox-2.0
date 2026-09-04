import {
  buildCoverageAudit,
  type AnalysisReport,
  type AnalysisType,
  type CompanySearchResult,
  type CoverageAudit,
  type InvestmentProfile,
  type ProviderDiagnostic,
} from "@/lib/analysis";
import { resolveCanonicalCompanySelection } from "./company-search";
import { analyzeCompany, searchCompanies } from "./enhanced-provider";

type ResolutionResult = ReturnType<typeof resolveCanonicalCompanySelection>;
type AnalyzeCompanyArgs = Parameters<typeof analyzeCompany>[0];
type AnalyzeCompanyResult = Awaited<ReturnType<typeof analyzeCompany>>;

export type CoverageAuditDependencies = {
  searchCompanies: (query: string) => Promise<CompanySearchResult[]>;
  resolveCanonicalCompanySelection: (
    requested: CompanySearchResult,
    candidates: CompanySearchResult[],
  ) => ResolutionResult;
  analyzeCompany: (args: AnalyzeCompanyArgs) => Promise<AnalyzeCompanyResult>;
};

export type CoverageAuditReportSummary = {
  id: string;
  ticker: string;
  generatedAt: string;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
  dataCoverage: number | null;
  dataStatus: AnalysisReport["dataStatus"] | null;
  recommendation: AnalysisReport["recommendation"];
  score: number | null;
  personalizedScore: number | null;
  confidence: number | null;
  scenarioStatus: AnalysisReport["scenarioStatus"] | null;
  enginePresent: boolean;
  sourceCount: number;
  warningCount: number;
  missingDataCount: number;
  reconciliationWarningCount: number;
  sourceConflictCount: number;
  providerFailureCount: number;
  historicalCoverage: AnalysisReport["historical"] extends infer Historical
    ? Historical extends { coverage?: infer Coverage }
      ? Coverage | null
      : null
    : null;
};

export type CoverageAuditSuccess = {
  ok: true;
  requestedTicker: string;
  resolvedTicker: string;
  companyName: string;
  entityId: string | null;
  country: string | null;
  exchange: string | null;
  currency: string | null;
  audit: CoverageAudit;
  report: CoverageAuditReportSummary;
  providerDiagnostics: ProviderDiagnostic[];
};

export type CoverageAuditFailure = {
  ok: false;
  requestedTicker: string;
  resolvedTicker?: string;
  stage: "resolution" | "analysis";
  reason: string;
  candidateCount?: number;
  providerDiagnostics: ProviderDiagnostic[];
  warnings: string[];
};

export type CoverageAuditRunResult = CoverageAuditSuccess | CoverageAuditFailure;

export type CoverageAuditOptions = {
  analysisType?: AnalysisType;
  investmentProfile?: InvestmentProfile;
  dependencies?: Partial<CoverageAuditDependencies>;
};

const DEFAULT_DEPENDENCIES: CoverageAuditDependencies = {
  searchCompanies,
  resolveCanonicalCompanySelection,
  analyzeCompany,
};

function normalizedTicker(value: string): string {
  return value.trim().toUpperCase();
}

function requestedCompany(ticker: string): CompanySearchResult {
  return {
    ticker,
    canonicalTicker: ticker,
    name: ticker,
  };
}

function reportSummary(report: AnalysisReport, warnings: string[]): CoverageAuditReportSummary {
  const engine = report.engine;
  return {
    id: report.id,
    ticker: report.ticker,
    generatedAt: report.generatedAt,
    analysisType: report.analysisType,
    investmentProfile: report.investmentProfile,
    dataCoverage: typeof report.dataCoverage === "number" && Number.isFinite(report.dataCoverage)
      ? report.dataCoverage
      : null,
    dataStatus: report.dataStatus ?? null,
    recommendation: report.recommendation,
    score: typeof report.score?.score === "number" && Number.isFinite(report.score.score)
      ? report.score.score
      : null,
    personalizedScore: typeof report.score?.personalizedScore === "number" && Number.isFinite(report.score.personalizedScore)
      ? report.score.personalizedScore
      : null,
    confidence: typeof report.score?.confidence === "number" && Number.isFinite(report.score.confidence)
      ? report.score.confidence
      : null,
    scenarioStatus: report.scenarioStatus ?? null,
    enginePresent: Boolean(engine),
    sourceCount: report.sources.length,
    warningCount: warnings.length,
    missingDataCount: engine?.missingData.length ?? 0,
    reconciliationWarningCount: engine?.reconciliation.filter((item) => item.status === "warning").length ?? 0,
    sourceConflictCount: engine?.sourceConflicts.length ?? 0,
    providerFailureCount: (report.providerDiagnostics ?? []).filter((item) => item.status === "unavailable").length,
    historicalCoverage: report.historical?.coverage ?? null,
  };
}

export async function coverageAudit(
  tickerValue: string,
  options: CoverageAuditOptions = {},
): Promise<CoverageAuditRunResult> {
  const requestedTicker = normalizedTicker(tickerValue);
  if (!requestedTicker) {
    return {
      ok: false,
      requestedTicker,
      stage: "resolution",
      reason: "empty_ticker",
      candidateCount: 0,
      providerDiagnostics: [],
      warnings: [],
    };
  }

  const dependencies: CoverageAuditDependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...(options.dependencies ?? {}),
  };

  let candidates: CompanySearchResult[];
  try {
    candidates = await dependencies.searchCompanies(requestedTicker);
  } catch {
    return {
      ok: false,
      requestedTicker,
      stage: "resolution",
      reason: "search_provider_error",
      candidateCount: 0,
      providerDiagnostics: [],
      warnings: [],
    };
  }

  const resolution = dependencies.resolveCanonicalCompanySelection(
    requestedCompany(requestedTicker),
    candidates,
  );
  if (!resolution.ok) {
    return {
      ok: false,
      requestedTicker,
      stage: "resolution",
      reason: resolution.reason,
      candidateCount: candidates.length,
      providerDiagnostics: [],
      warnings: [],
    };
  }

  const company = resolution.company;
  const resolvedTicker = normalizedTicker(company.canonicalTicker ?? company.ticker);
  const analysisType = options.analysisType ?? "numbers";
  const investmentProfile = options.investmentProfile ?? "balanced";
  const analysis = await dependencies.analyzeCompany({
    company,
    analysisType,
    investmentProfile,
  });

  if (!analysis.ok) {
    return {
      ok: false,
      requestedTicker,
      resolvedTicker,
      stage: "analysis",
      reason: analysis.error,
      providerDiagnostics: analysis.providerDiagnostics,
      warnings: analysis.warnings,
    };
  }

  const report = analysis.data;
  if (!report.engine) {
    return {
      ok: false,
      requestedTicker,
      resolvedTicker,
      stage: "analysis",
      reason: "canonical_engine_result_missing",
      providerDiagnostics: report.providerDiagnostics ?? [],
      warnings: analysis.warnings,
    };
  }

  const audit = buildCoverageAudit({ ticker: resolvedTicker, result: report.engine });
  const providerDiagnostics = report.providerDiagnostics ?? report.engine.diagnostics.providerDiagnostics ?? [];

  return {
    ok: true,
    requestedTicker,
    resolvedTicker,
    companyName: report.companyName,
    entityId: company.entityId ?? null,
    country: company.country ?? null,
    exchange: company.exchange ?? null,
    currency: company.currency ?? null,
    audit,
    report: reportSummary(report, analysis.warnings),
    providerDiagnostics,
  };
}
