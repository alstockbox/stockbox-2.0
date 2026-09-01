import type { AnalysisReport, AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import { applyVerifiedMarketHistoryEnrichment } from "@/lib/analysis/market-history-enrichment";
import { augmentWithOfficialResearch } from "@/lib/analysis/official-research-augment";
import { enforceReportHistoricalCurrencyIntegrity } from "@/lib/analysis/report-currency-integrity";
import { getServerEnv } from "@/lib/env/server";
import { applyTwelveDataEstimateSnapshot } from "./estimate-report-augment";
import { analyzeCompany as analyzeCoreCompany, searchCompanies } from "./provider";
import { runWithOfficialAnalysisContext } from "./official-analysis-context";
import { fetchOfficialResearchBundle, type OfficialResearchBundle } from "./official-research";
import { fetchTwelveDataEstimateSnapshot } from "./twelve-data-estimates";
import { fetchYahooLongHistory } from "./yahoo-long-history";

export { searchCompanies };
export * from "./provider";

type AnalyzeCompanyArgs = Parameters<typeof analyzeCoreCompany>[0];
type AnalyzeCompanyResult = Awaited<ReturnType<typeof analyzeCoreCompany>>;
type EstimateResult = Awaited<ReturnType<typeof fetchTwelveDataEstimateSnapshot>>;

function uniqueSources(sources: AnalysisSource[]): AnalysisSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = [source.provider ?? source.name, source.url, source.dataAsOf ?? ""].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueDiagnostics(diagnostics: ProviderDiagnostic[]): ProviderDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.provider}|${diagnostic.capability}|${diagnostic.status}|${diagnostic.reason ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isDeepResearch(args: AnalyzeCompanyArgs): boolean {
  return args.analysisType === "deep" || args.analysisType === "research";
}

function wantsHistoricalEnrichment(args: AnalyzeCompanyArgs): boolean {
  return args.analysisType === "numbers"
    || args.analysisType === "deep"
    || args.analysisType === "research"
    || args.investmentProfile === "dividend";
}

function needsHistoricalEnrichment(report: AnalysisReport): boolean {
  if (!report.market || !report.historical) return false;
  const coverage = report.historical.coverage;
  if (!coverage) return true;
  return coverage.price.status !== "full" || coverage.dividend.status !== "full";
}

async function enrichVerifiedHistory(
  report: AnalysisReport,
  company: CompanySearchResult,
  args: AnalyzeCompanyArgs,
): Promise<void> {
  // Repair legacy/cached history that lost quote-currency metadata before any secondary history
  // can be rendered. Explicit currency conflicts fail closed.
  enforceReportHistoricalCurrencyIntegrity(report);
  if (!wantsHistoricalEnrichment(args) || !needsHistoricalEnrichment(report)) return;

  const longHistory = await fetchYahooLongHistory(company);
  report.providerDiagnostics = uniqueDiagnostics([
    ...(report.providerDiagnostics ?? []),
    longHistory.diagnostic,
  ]);
  if (!longHistory.ok) return;

  const applied = applyVerifiedMarketHistoryEnrichment(report, longHistory.data);
  if (applied.applied) {
    report.sources = uniqueSources([...(report.sources ?? []), longHistory.source]);
  }

  // Re-run the integrity gate after secondary history has been normalized into the primary quote unit.
  enforceReportHistoricalCurrencyIntegrity(report);
}

async function safeOfficialBundle(args: AnalyzeCompanyArgs): Promise<OfficialResearchBundle | null> {
  try {
    return await fetchOfficialResearchBundle(args.company, { deepResearch: isDeepResearch(args) });
  } catch {
    // Official-source enrichment is additive. A provider or configuration failure must never
    // prevent the core StockBox analysis from completing.
    return null;
  }
}

async function safeEstimateSnapshot(args: AnalyzeCompanyArgs): Promise<EstimateResult | null> {
  const env = getServerEnv();
  if (env.ESTIMATES_PROVIDER !== "twelve_data") return null;
  try {
    return await fetchTwelveDataEstimateSnapshot(args.company, env.TWELVE_DATA_API_KEY ?? "");
  } catch {
    // Estimates are additive and may be unavailable for a symbol or provider plan. Core
    // financial analysis must remain usable without silently inventing forward data.
    return null;
  }
}

function refreshAdminQa(report: AnalysisReport) {
  if (!report.adminQa) return;
  report.adminQa.providerAttempts = uniqueDiagnostics([
    ...report.adminQa.providerAttempts,
    ...(report.providerDiagnostics ?? []),
  ]);
  report.adminQa.providerFailures = report.adminQa.providerAttempts.filter((item) => item.status === "unavailable");
  report.adminQa.selectedProviders = [...new Set(
    (report.sources ?? []).map((source) => source.provider).filter((provider): provider is string => Boolean(provider)),
  )];
}

export async function analyzeCompany(args: AnalyzeCompanyArgs): Promise<AnalyzeCompanyResult> {
  const [bundle, estimateResult] = await Promise.all([
    safeOfficialBundle(args),
    safeEstimateSnapshot(args),
  ]);

  const resolvedCompany = bundle?.company ?? args.company;
  const macro = bundle?.macro?.data;
  const result = await runWithOfficialAnalysisContext(
    {
      riskFreeRate: macro?.riskFreeRate ?? null,
      riskFreeSource: macro ? `Sveriges Riksbank — ${macro.seriesLabel}` : null,
      riskFreeAsOf: macro?.observationDate ?? null,
    },
    () => analyzeCoreCompany({ ...args, company: resolvedCompany }),
  );

  const enrichmentSources = bundle?.sources ?? [];
  const enrichmentDiagnostics = uniqueDiagnostics([
    ...(bundle?.diagnostics ?? []),
    ...(estimateResult ? [estimateResult.diagnostic] : []),
  ]);

  if (!result.ok) {
    return {
      ...result,
      sources: uniqueSources([...(result.sources ?? []), ...enrichmentSources]),
      providerDiagnostics: uniqueDiagnostics([...(result.providerDiagnostics ?? []), ...enrichmentDiagnostics]),
    };
  }

  const report = result.data;
  report.sources = uniqueSources([...(report.sources ?? []), ...enrichmentSources]);
  report.providerDiagnostics = uniqueDiagnostics([
    ...(report.providerDiagnostics ?? []),
    ...enrichmentDiagnostics,
  ]);

  if (bundle) {
    // Enrichment must never invalidate a core analysis. This also keeps historical/test reports
    // that predate the research fields compatible with the current provider contract.
    try {
      augmentWithOfficialResearch(report, bundle);
    } catch {
      // Provider diagnostics and source provenance above remain available even if an optional
      // research presentation layer cannot be attached to an older report shape.
    }
  }

  if (estimateResult?.ok) {
    try {
      const source = applyTwelveDataEstimateSnapshot(report, estimateResult.data);
      report.sources = uniqueSources([...report.sources, source]);
    } catch {
      // Keep the estimates diagnostic visible if presentation enrichment cannot be attached.
      // Missing estimate presentation must never corrupt or fail the core analysis.
    }
  }

  try {
    await enrichVerifiedHistory(report, resolvedCompany, args);
  } catch {
    // Long-history enrichment is additive. Currency integrity has already been enforced before
    // secondary data can be rendered, and a history-provider outage must not fail the analysis.
    enforceReportHistoricalCurrencyIntegrity(report);
  }

  refreshAdminQa(report);

  return {
    ...result,
    data: report,
    sources: report.sources,
  };
}
