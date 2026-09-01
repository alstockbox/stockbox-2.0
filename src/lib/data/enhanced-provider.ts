import type { AnalysisReport, AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import { applyVerifiedMarketHistoryEnrichment } from "@/lib/analysis/market-history-enrichment";
import { augmentWithOfficialResearch } from "@/lib/analysis/official-research-augment";
import { enforceReportHistoricalCurrencyIntegrity } from "@/lib/analysis/report-currency-integrity";
import { analyzeCompany as analyzeCoreCompany, searchCompanies } from "./provider";
import { runWithOfficialAnalysisContext } from "./official-analysis-context";
import { fetchOfficialResearchBundle, type OfficialResearchBundle } from "./official-research";
import { fetchYahooLongHistory } from "./yahoo-long-history";

export { searchCompanies };
export * from "./provider";

type AnalyzeCompanyArgs = Parameters<typeof analyzeCoreCompany>[0];
type AnalyzeCompanyResult = Awaited<ReturnType<typeof analyzeCoreCompany>>;

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
  return args.analysisType === "numbers" || args.analysisType === "deep" || args.analysisType === "research" || args.investmentProfile === "dividend";
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
  // First repair legacy/cached history that lost quote-currency metadata. Explicit conflicts fail closed.
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

export async function analyzeCompany(args: AnalyzeCompanyArgs): Promise<AnalyzeCompanyResult> {
  const bundle = await safeOfficialBundle(args);
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

  if (!result.ok) {
    if (!bundle) return result;
    return {
      ...result,
      sources: uniqueSources([...(result.sources ?? []), ...bundle.sources]),
      providerDiagnostics: uniqueDiagnostics([...(result.providerDiagnostics ?? []), ...bundle.diagnostics]),
    };
  }

  const report = result.data;
  if (bundle) {
    report.sources = uniqueSources([...(report.sources ?? []), ...bundle.sources]);
    report.providerDiagnostics = uniqueDiagnostics([
      ...(report.providerDiagnostics ?? []),
      ...bundle.diagnostics,
    ]);

    // Enrichment must never invalidate a core analysis. This also keeps historical/test reports
    // that predate the research fields compatible with the current provider contract.
    try {
      augmentWithOfficialResearch(report, bundle);
    } catch {
      // Provider diagnostics and source provenance above remain available even if an optional
      // research presentation layer cannot be attached to an older report shape.
    }
  }

  try {
    await enrichVerifiedHistory(report, resolvedCompany, args);
  } catch {
    // Long-history enrichment is additive. Currency integrity has already been enforced before
    // secondary data can be rendered, and a history-provider outage must not fail the analysis.
    enforceReportHistoricalCurrencyIntegrity(report);
  }

  return {
    ...result,
    data: report,
    sources: report.sources,
    providerDiagnostics: report.providerDiagnostics,
  };
}
