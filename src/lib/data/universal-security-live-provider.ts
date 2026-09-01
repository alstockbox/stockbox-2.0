import { analyzeInvestmentCompany, classifyUniversalSecurity } from "@/lib/analysis/universal-security";
import type { Recommendation } from "@/lib/analysis/types";
import {
  analyzeCompany as analyzeUniversalCompany,
  searchCompanies,
  supportsUniversalSecurityAnalysis,
  type UniversalSecurityReport,
} from "./universal-security-provider";
import { fetchOfficialInvestmentCompanyNav } from "./official-investment-company-nav";

export { searchCompanies, supportsUniversalSecurityAnalysis };

type AnalyzeArgs = Parameters<typeof analyzeUniversalCompany>[0];
type AnalyzeResult = Awaited<ReturnType<typeof analyzeUniversalCompany>>;

function recommendationForScore(score: number | null, coverage: number): Recommendation {
  if (score === null || coverage < 0.5) return "No Rating";
  if (score >= 85) return "Strong Buy";
  if (score >= 70) return "Buy";
  if (score >= 45) return "Hold";
  if (score >= 30) return "Sell";
  return "Strong Sell";
}

function appendUnique<T>(values: T[] | undefined, value: T, key: (item: T) => string): T[] {
  const existing = values ?? [];
  const valueKey = key(value);
  return existing.some((item) => key(item) === valueKey) ? existing : [...existing, value];
}

async function enrichWithOfficialInvestmentCompanyNav(
  report: UniversalSecurityReport,
  args: AnalyzeArgs,
): Promise<UniversalSecurityReport> {
  if (report.analysisArchetype !== "holding_company") return report;

  const navResult = await fetchOfficialInvestmentCompanyNav(args.company);
  report.providerDiagnostics = appendUnique(
    report.providerDiagnostics,
    navResult.ok ? navResult.data.diagnostic : navResult.diagnostic,
    (item) => `${item.provider}|${item.capability}|${item.status}|${item.reason ?? ""}`,
  );

  if (!navResult.ok) {
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      `Official investment-company NAV unavailable: ${navResult.message} StockBox keeps NAV-dependent factors as N/A and does not substitute consolidated book equity.`,
    ])];
    return report;
  }

  const latest = report.engine?.metrics.latestPeriod ?? null;
  const analysis = analyzeInvestmentCompany({
    sharePrice: report.market?.price ?? null,
    dilutedShares: report.market?.sharesOutstanding ?? latest?.currentSharesOutstanding ?? latest?.sharesDiluted ?? null,
    reportedNav: navResult.data.reportedNav,
    reportedNavPerShare: navResult.data.reportedNavPerShare,
    cash: latest?.cashAndEquivalents ?? null,
    debt: latest?.totalDebt ?? null,
  });

  report.securityClassification = classifyUniversalSecurity({
    company: args.company,
    analysisArchetype: "holding_company",
  });
  report.securityAnalysis = {
    ...(report.securityAnalysis ?? {}),
    investmentCompany: analysis,
  };
  report.sources = appendUnique(
    report.sources,
    navResult.data.source,
    (item) => `${item.provider ?? item.name}|${item.url}|${item.dataAsOf ?? ""}`,
  );

  if (analysis.score.score !== null) {
    report.score.score = analysis.score.score;
    report.score.personalizedScore = analysis.score.score;
    report.score.confidence = Math.round(Math.min(report.score.confidence, analysis.score.coverage * 100));
    report.dataCoverage = Math.max(report.dataCoverage, analysis.score.coverage);
    report.recommendation = recommendationForScore(analysis.score.score, analysis.score.coverage);
  }

  report.score.missingData = [...new Set([
    ...report.score.missingData.filter((item) => !item.startsWith("Investment-company model requires verified NAV/SOTP inputs")),
    ...analysis.score.missing,
  ])];

  report.summary = `${report.summary} Verified official NAV${navResult.data.reportedNavPerShare !== null ? ` of ${navResult.data.reportedNavPerShare.toFixed(2)} per share` : ""}${navResult.data.navAsOf ? ` as of ${navResult.data.navAsOf}` : ""} is incorporated into the investment-company valuation model.`;

  return report;
}

export async function analyzeCompany(args: AnalyzeArgs): Promise<AnalyzeResult> {
  const result = await analyzeUniversalCompany(args);
  if (!result.ok) return result;

  const report = result.data as UniversalSecurityReport;
  if (report.analysisArchetype !== "holding_company") return result;

  try {
    const enriched = await enrichWithOfficialInvestmentCompanyNav(report, args);
    return {
      ...result,
      data: enriched,
      sources: enriched.sources,
      warnings: result.warnings,
    };
  } catch {
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      "Official investment-company NAV enrichment failed unexpectedly; NAV-dependent factors remain N/A and the base report is preserved.",
    ])];
    return { ...result, data: report };
  }
}
