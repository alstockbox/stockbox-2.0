import type {
  FinancialAnalysisResult,
  ProviderDiagnostic,
  ScoreContributor,
  ScoreDimensionKey,
} from "./types";

export const COVERAGE_DATA_STATUSES = [
  "AVAILABLE",
  "DERIVED",
  "NOT_APPLICABLE",
  "PROVIDER_MISSING",
  "PROVIDER_ERROR",
  "TIMEOUT",
  "RATE_LIMITED",
  "MAPPING_ERROR",
  "PARSING_ERROR",
  "NORMALIZATION_ERROR",
  "CALCULATION_FAILED",
  "INVALID",
  "STALE",
  "INSUFFICIENT_HISTORY",
  "CURRENCY_ERROR",
  "PERIOD_ERROR",
  "UNKNOWN",
] as const;

export type CoverageDataStatus = (typeof COVERAGE_DATA_STATUSES)[number];

export type CoverageAuditMetric = {
  id: string;
  category: ScoreDimensionKey;
  label: string;
  status: CoverageDataStatus;
  relevant: boolean;
  available: boolean;
  value: number | null;
  weight: number;
  reason: string | null;
  source: string | null;
  period: string | null;
  providerDiagnostics: ProviderDiagnostic[];
};

export type CoverageAuditCategory = {
  category: ScoreDimensionKey;
  relevant: number;
  available: number;
  missing: number;
  notApplicable: number;
  coverage: number;
  metrics: CoverageAuditMetric[];
};

export type CoverageAudit = {
  ticker: string;
  archetype: FinancialAnalysisResult["analysisArchetype"];
  metricCoverage: number;
  scoreCoverage: number;
  relevantMetricCount: number;
  availableMetricCount: number;
  missingMetricCount: number;
  notApplicableMetricCount: number;
  unknownMetricCount: number;
  categories: Record<ScoreDimensionKey, CoverageAuditCategory>;
  metrics: CoverageAuditMetric[];
  rootCauseCounts: Record<CoverageDataStatus, number>;
  providerDiagnostics: ProviderDiagnostic[];
};

const REIT_SPECIALIZED_CONTRIBUTORS = new Set([
  "FFO growth",
  "AFFO growth",
  "FFO margin",
  "FFO yield",
  "AFFO",
  "AFFO payout",
  "Dividend coverage",
  "Occupancy",
  "Same-store NOI growth",
  "Net debt / EBITDAre",
  "Fixed-charge coverage",
]);

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function inferredMissingReason(
  contributor: ScoreContributor,
  result: FinancialAnalysisResult,
): string | null {
  const explicit = contributor.missingReason?.trim();
  if (explicit) return explicit;
  if (result.analysisArchetype === "reit" && REIT_SPECIALIZED_CONTRIBUTORS.has(contributor.label)) {
    return `${contributor.label} requires reported specialized REIT data; operating-company substitutes are not used.`;
  }
  return null;
}

function diagnosticFailureStatus(diagnostic: ProviderDiagnostic): CoverageDataStatus | null {
  const reason = normalizedText(diagnostic.reason);
  if (/rate[ -]?limit|too many requests|\b429\b/.test(reason)) return "RATE_LIMITED";
  if (/timeout|timed out|aborted/.test(reason)) return "TIMEOUT";
  if (/pars(e|ing)|unexpected content|html response|unexpected columns/.test(reason)) return "PARSING_ERROR";
  if (/map(ping)?|taxonomy|concept resolution/.test(reason)) return "MAPPING_ERROR";
  if (/normaliz|unit conversion|scale conversion/.test(reason)) return "NORMALIZATION_ERROR";
  if (/invalid|impossible|future date/.test(reason)) return "INVALID";
  if (diagnostic.status === "partial" || diagnostic.status === "unsupported") return "PROVIDER_MISSING";
  if (diagnostic.status === "unavailable") return "PROVIDER_ERROR";
  return null;
}

function relevantCapability(reason: string): ProviderDiagnostic["capability"] | null {
  if (/price|market cap|market value|enterprise value|beta|momentum|price history/.test(reason)) return "market_data";
  if (/estimate|forward|consensus/.test(reason)) return "estimates";
  if (/specialized|cet1|deposit|loan|ffo|affo|occupancy|reserve|premium|tangible book/.test(reason)) return "specialized";
  if (/revenue|income|ebitda|cash flow|capex|debt|equity|assets|liabilit|shares|margin|dividend|eps|book value|roic|roa|roe/.test(reason)) return "fundamentals";
  return null;
}

function providerDiagnosticsForReason(
  reason: string,
  diagnostics: ProviderDiagnostic[],
): ProviderDiagnostic[] {
  const normalizedReason = normalizedText(reason);
  if (!normalizedReason) return [];
  const capability = relevantCapability(normalizedReason);
  if (!capability) {
    const explicitlyProviderRelated = /provider|source|upstream|data service|data feed/.test(normalizedReason);
    return explicitlyProviderRelated ? diagnostics.filter((item) => item.status !== "available") : [];
  }
  return diagnostics.filter((item) => item.capability === capability && item.status !== "available");
}

function classifyMissingStatus(
  reasonValue: string | null | undefined,
  result: FinancialAnalysisResult,
): { status: CoverageDataStatus; diagnostics: ProviderDiagnostic[] } {
  const reason = normalizedText(reasonValue);

  if (/rate[ -]?limit|too many requests|\b429\b/.test(reason)) return { status: "RATE_LIMITED", diagnostics: [] };
  if (/timeout|timed out|aborted/.test(reason)) return { status: "TIMEOUT", diagnostics: [] };
  if (/mapping|taxonomy|concept resolution/.test(reason)) return { status: "MAPPING_ERROR", diagnostics: [] };
  if (/pars(e|ing)|unexpected content|html response|unexpected columns/.test(reason)) return { status: "PARSING_ERROR", diagnostics: [] };
  if (/normaliz|unit conversion|scale conversion/.test(reason)) return { status: "NORMALIZATION_ERROR", diagnostics: [] };
  if (/calculation failed|unable to calculate|calculation error/.test(reason)) return { status: "CALCULATION_FAILED", diagnostics: [] };
  if (/currency|same-currency/.test(reason)) return { status: "CURRENCY_ERROR", diagnostics: [] };
  if (/stale|outdated|freshness/.test(reason)) return { status: "STALE", diagnostics: [] };
  if (/insufficient history|history is required|at least three contiguous|three-year-prior|five-year-prior|comparable latest and prior annual|comparable latest and three-year-prior/.test(reason)) {
    return { status: "INSUFFICIENT_HISTORY", diagnostics: [] };
  }
  if (/period mismatch|period alignment|fiscal period|ttm period|selected (annual|ttm|fiscal|reporting) period/.test(reason)) {
    return { status: "PERIOD_ERROR", diagnostics: [] };
  }
  if (/invalid|impossible|non-finite/.test(reason)) return { status: "INVALID", diagnostics: [] };
  if (/specialized (?:reit|bank|insurer) data/.test(reason)) return { status: "PROVIDER_MISSING", diagnostics: [] };

  const diagnostics = providerDiagnosticsForReason(reason, result.diagnostics.providerDiagnostics ?? []);
  for (const diagnostic of diagnostics) {
    const classified = diagnosticFailureStatus(diagnostic);
    if (classified === "RATE_LIMITED" || classified === "TIMEOUT") return { status: classified, diagnostics };
  }
  for (const diagnostic of diagnostics) {
    const classified = diagnosticFailureStatus(diagnostic);
    if (classified) return { status: classified, diagnostics };
  }

  if (/provider|not returned|not reported|missing|requires reported|requires .* data|unavailable/.test(reason) && diagnostics.length) {
    return { status: "PROVIDER_MISSING", diagnostics };
  }
  return { status: "UNKNOWN", diagnostics };
}

function explicitDerivedContributor(contributor: ScoreContributor, result: FinancialAnalysisResult): boolean {
  const source = normalizedText(contributor.source);
  if (/stockbox.*(formula|deterministic)|derived|calculated/.test(source)) return true;
  const matchingProvenance = Object.values(result.provenance ?? {}).filter((item) => {
    if (!contributor.source || item.source !== contributor.source) return false;
    return !contributor.period || !item.periodEnd || contributor.period === item.periodEnd;
  });
  return matchingProvenance.length > 0 && matchingProvenance.every((item) => item.valueKind === "derived");
}

function auditMetric(
  category: ScoreDimensionKey,
  contributor: ScoreContributor,
  result: FinancialAnalysisResult,
): CoverageAuditMetric {
  const relevant = contributor.availability !== "unsuitable";
  const available = contributor.availability === "available";
  const reason = inferredMissingReason(contributor, result);
  let status: CoverageDataStatus;
  let diagnostics: ProviderDiagnostic[] = [];

  if (!relevant) {
    status = "NOT_APPLICABLE";
  } else if (available) {
    status = explicitDerivedContributor(contributor, result) ? "DERIVED" : "AVAILABLE";
  } else {
    const classified = classifyMissingStatus(reason, result);
    status = classified.status;
    diagnostics = classified.diagnostics;
  }

  return {
    id: `${category}:${contributor.label}`,
    category,
    label: contributor.label,
    status,
    relevant,
    available,
    value: typeof contributor.value === "number" && Number.isFinite(contributor.value) ? contributor.value : null,
    weight: contributor.weight,
    reason,
    source: contributor.source ?? null,
    period: contributor.period ?? null,
    providerDiagnostics: diagnostics,
  };
}

function categoryAudit(
  category: ScoreDimensionKey,
  metrics: CoverageAuditMetric[],
): CoverageAuditCategory {
  const relevantMetrics = metrics.filter((metric) => metric.relevant);
  const availableMetrics = relevantMetrics.filter((metric) => metric.available);
  const missing = relevantMetrics.length - availableMetrics.length;
  return {
    category,
    relevant: relevantMetrics.length,
    available: availableMetrics.length,
    missing,
    notApplicable: metrics.length - relevantMetrics.length,
    coverage: relevantMetrics.length ? availableMetrics.length / relevantMetrics.length : 1,
    metrics,
  };
}

export function buildCoverageAudit(input: {
  ticker: string;
  result: FinancialAnalysisResult;
}): CoverageAudit {
  const ticker = input.ticker.trim().toUpperCase();
  const result = input.result;
  const metrics = (Object.entries(result.scores.dimensions) as Array<[ScoreDimensionKey, (typeof result.scores.dimensions)[ScoreDimensionKey]]>)
    .flatMap(([category, dimension]) => (dimension.contributors ?? []).map((contributor) => auditMetric(category, contributor, result)));

  const categoryEntries = (Object.keys(result.scores.dimensions) as ScoreDimensionKey[]).map((category) => [
    category,
    categoryAudit(category, metrics.filter((metric) => metric.category === category)),
  ] as const);
  const categories = Object.fromEntries(categoryEntries) as Record<ScoreDimensionKey, CoverageAuditCategory>;

  const relevantMetrics = metrics.filter((metric) => metric.relevant);
  const availableMetrics = relevantMetrics.filter((metric) => metric.available);
  const missingMetricCount = relevantMetrics.length - availableMetrics.length;
  const rootCauseCounts = Object.fromEntries(COVERAGE_DATA_STATUSES.map((status) => [status, 0])) as Record<CoverageDataStatus, number>;
  for (const metric of metrics) rootCauseCounts[metric.status] += 1;

  return {
    ticker,
    archetype: result.analysisArchetype,
    metricCoverage: relevantMetrics.length ? availableMetrics.length / relevantMetrics.length : 1,
    scoreCoverage: result.dataCoverage,
    relevantMetricCount: relevantMetrics.length,
    availableMetricCount: availableMetrics.length,
    missingMetricCount,
    notApplicableMetricCount: metrics.length - relevantMetrics.length,
    unknownMetricCount: rootCauseCounts.UNKNOWN,
    categories,
    metrics,
    rootCauseCounts,
    providerDiagnostics: result.diagnostics.providerDiagnostics ?? [],
  };
}
