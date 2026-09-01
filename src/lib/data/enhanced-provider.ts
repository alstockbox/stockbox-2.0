import type { AnalysisReport, AnalysisSource, ProviderDiagnostic } from "@/lib/analysis/types";
import { augmentWithOfficialResearch } from "@/lib/analysis/official-research-augment";
import { getEstimatesProvider, getServerEnv } from "@/lib/env/server";
import { applyTwelveDataEstimateSnapshot } from "./estimate-report-augment";
import { analyzeCompany as analyzeCoreCompany, searchCompanies } from "./provider";
import { runWithOfficialAnalysisContext } from "./official-analysis-context";
import { fetchOfficialResearchBundle, type OfficialResearchBundle } from "./official-research";
import { fetchTwelveDataEstimateSnapshot } from "./twelve-data-estimates";

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
  if (getEstimatesProvider(env) !== "twelve_data") return null;
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
  const runCore = () => analyzeCoreCompany({ ...args, company: resolvedCompany });
  const result = bundle
    ? await runWithOfficialAnalysisContext(
        {
          riskFreeRate: macro?.riskFreeRate ?? null,
          riskFreeSource: macro ? `Sveriges Riksbank — ${macro.seriesLabel}` : null,
          riskFreeAsOf: macro?.observationDate ?? null,
        },
        runCore,
      )
    : await runCore();

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

  // Enrichment must never invalidate a core analysis. This also keeps historical/test reports
  // that predate the research fields compatible with the current provider contract.
  if (bundle) {
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

  refreshAdminQa(report);

  return {
    ...result,
    data: report,
    sources: report.sources,
  };
}
