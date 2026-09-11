import {
  SPECIALIST_COVERAGE_TARGET,
  specialistCoverageGateMessage,
  specialistCoverageMeetsTarget,
} from "@/lib/analysis/specialist-coverage";
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
  if (score === null || !specialistCoverageMeetsTarget(coverage)) return "No Rating";
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

function applyInvestmentCompanyCoverageGate(report: UniversalSecurityReport): UniversalSecurityReport {
  const specialist = report.securityAnalysis?.investmentCompany;
  if (!specialist) return report;

  const coverage = specialist.score.coverage;
  const specialistScore = specialist.score.score;
  // Investment-company coverage and score must come from the same specialist model.
  // Never let strong generic corporate coverage or a stale generic score mask missing
  // NAV/look-through inputs after an issuer is routed into the investment-company regime.
  report.dataCoverage = coverage;
  report.recommendation = recommendationForScore(specialistScore, coverage);
  report.score.score = specialistScore;
  report.score.personalizedScore = specialistScore;
  report.score.confidence = Math.round(Math.min(report.score.confidence, Math.max(0, coverage * 100)));

  const gateMessage = specialistCoverageGateMessage("Investment-company", coverage);
  if (gateMessage) {
    report.score.missingData = [...new Set([...report.score.missingData, gateMessage])];
  }
  return report;
}

async function enrichWithOfficialInvestmentCompanyNav(
  report: UniversalSecurityReport,
  args: AnalyzeArgs,
): Promise<UniversalSecurityReport> {
  // The primary universal provider already performs the full investment-company enrichment
  // (NAV history, holdings quality, shareholder return, governance, capital allocation, etc.).
  // If that specialist result exists, it is authoritative. Re-running a NAV-only fallback here
  // would discard verified factors and can incorrectly downgrade 99-100% coverage to No Rating.
  if (report.securityAnalysis?.investmentCompany) {
    return applyInvestmentCompanyCoverageGate(report);
  }

  const alreadyClassifiedAsHoldingCompany = report.analysisArchetype === "holding_company";
  const navResult = await fetchOfficialInvestmentCompanyNav(args.company);

  // A verified official NAV adapter is itself strong evidence that the issuer belongs in the
  // investment-company regime. This prevents a vague upstream industry/SIC label from routing
  // a known investment company through the ordinary operating-company methodology.
  if (!navResult.ok && !alreadyClassifiedAsHoldingCompany) return report;

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
    return applyInvestmentCompanyCoverageGate(report);
  }

  report.analysisArchetype = "holding_company";
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

  report.score.missingData = [...new Set([
    ...report.score.missingData.filter((item) => !item.startsWith("Investment-company model requires verified NAV/SOTP inputs")),
    ...analysis.score.missing,
  ])];

  report.summary = `${report.summary} Verified official NAV${navResult.data.reportedNavPerShare !== null ? ` of ${navResult.data.reportedNavPerShare.toFixed(2)} per share` : ""}${navResult.data.navAsOf ? ` as of ${navResult.data.navAsOf}` : ""} is incorporated into the investment-company valuation model. A full StockBox rating requires at least ${(SPECIALIST_COVERAGE_TARGET * 100).toFixed(0)}% verified investment-company factor coverage.`;

  return applyInvestmentCompanyCoverageGate(report);
}

export async function analyzeCompany(args: AnalyzeArgs): Promise<AnalyzeResult> {
  const result = await analyzeUniversalCompany(args);
  if (!result.ok) return result;

  const report = result.data as UniversalSecurityReport;

  try {
    const enriched = await enrichWithOfficialInvestmentCompanyNav(report, args);
    if (enriched === report && report.analysisArchetype !== "holding_company" && !report.securityAnalysis?.investmentCompany) {
      return result;
    }
    return {
      ...result,
      data: enriched,
      sources: enriched.sources,
      warnings: result.warnings,
    };
  } catch {
    if (report.analysisArchetype !== "holding_company" && !report.securityAnalysis?.investmentCompany) return result;
    report.score.missingData = [...new Set([
      ...report.score.missingData,
      "Official investment-company NAV enrichment failed unexpectedly; NAV-dependent factors remain N/A and the base report is preserved.",
    ])];
    return { ...result, data: applyInvestmentCompanyCoverageGate(report) };
  }
}