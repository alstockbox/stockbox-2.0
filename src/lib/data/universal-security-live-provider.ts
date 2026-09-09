import {
  analyzeCompany as analyzeUniversalCompany,
  searchCompanies,
  supportsUniversalSecurityAnalysis,
  type UniversalSecurityReport,
} from "./universal-security-provider";
import { persistSpecialistRecommendationLiveAuditV3 } from "./recommendation-specialist-live-audit-v3";

export { searchCompanies, supportsUniversalSecurityAnalysis };

type AnalyzeArgs = Parameters<typeof analyzeUniversalCompany>[0];
type AnalyzeResult = Awaited<ReturnType<typeof analyzeUniversalCompany>>;

export async function analyzeCompany(args: AnalyzeArgs): Promise<AnalyzeResult> {
  const result = await analyzeUniversalCompany(args);
  if (!result.ok) return result;

  const report = result.data as UniversalSecurityReport;

  // The canonical universal provider owns all specialist enrichment. This
  // wrapper only adds the fail-open learning/audit side channel so the audit
  // sees the exact final report returned to callers and can never overwrite
  // richer investment-company NAV/holdings/governance analysis.
  await persistSpecialistRecommendationLiveAuditV3(report);

  return {
    ...result,
    data: report,
    sources: report.sources,
    warnings: result.warnings,
  };
}
