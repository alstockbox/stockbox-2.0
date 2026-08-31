import type { AnalysisSource, ProviderDiagnostic } from "@/lib/analysis/types";
import { augmentWithOfficialResearch } from "@/lib/analysis/official-research-augment";
import { analyzeCompany as analyzeCoreCompany, searchCompanies } from "./provider";
import { runWithOfficialAnalysisContext } from "./official-analysis-context";
import { fetchOfficialResearchBundle, type OfficialResearchBundle } from "./official-research";

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
  if (!bundle) return analyzeCoreCompany(args);

  const macro = bundle.macro?.data;
  const result = await runWithOfficialAnalysisContext(
    {
      riskFreeRate: macro?.riskFreeRate ?? null,
      riskFreeSource: macro ? `Sveriges Riksbank — ${macro.seriesLabel}` : null,
      riskFreeAsOf: macro?.observationDate ?? null,
    },
    () => analyzeCoreCompany({ ...args, company: bundle.company }),
  );

  if (!result.ok) {
    return {
      ...result,
      sources: uniqueSources([...result.sources, ...bundle.sources]),
      providerDiagnostics: uniqueDiagnostics([...result.providerDiagnostics, ...bundle.diagnostics]),
    };
  }

  const report = result.data;
  report.sources = uniqueSources([...report.sources, ...bundle.sources]);
  report.providerDiagnostics = uniqueDiagnostics([
    ...(report.providerDiagnostics ?? []),
    ...bundle.diagnostics,
  ]);
  augmentWithOfficialResearch(report, bundle);

  return {
    ...result,
    data: report,
    sources: uniqueSources([...result.sources, ...bundle.sources]),
  };
}
