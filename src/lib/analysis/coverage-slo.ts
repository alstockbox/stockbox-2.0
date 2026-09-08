export type CoverageAuditStatus =
  | "input_invalid"
  | "not_found"
  | "no_exact_match"
  | "unsupported_security_type"
  | "insufficient_fundamentals"
  | "fundamentals_provider_error"
  | "analysis_engine_error"
  | "completed";

export type CoverageAuditConflict = {
  severity: "medium" | "high";
  resolved?: boolean;
};

export type CoverageAuditRecord = {
  status: CoverageAuditStatus;
  rating: string | null;
  score: number | null;
  dataCoverage?: number | null;
  sourceConflicts?: CoverageAuditConflict[];
  fabricatedCriticalInputs?: number;
  identityVerified?: boolean | null;
  classificationVerified?: boolean | null;
  region?: string | null;
  instrumentType?: string | null;
};

export type CoverageSloThresholds = {
  minimumDiscoveryRate: number;
  minimumIdentityRate: number;
  minimumClassificationRate: number;
  minimumSupportCoverageRate: number;
  minimumAnalysisCompletionRate: number;
  maximumEngineErrorRate: number;
  maximumDirectionalHighConflictRate: number;
  maximumScoreRatingMismatchRate: number;
  maximumFabricatedCriticalInputRate: number;
};

export const STOCKBOX_COVERAGE_SLO: CoverageSloThresholds = {
  minimumDiscoveryRate: 0.995,
  minimumIdentityRate: 0.999,
  minimumClassificationRate: 0.995,
  minimumSupportCoverageRate: 0.99,
  minimumAnalysisCompletionRate: 0.99,
  maximumEngineErrorRate: 0,
  maximumDirectionalHighConflictRate: 0,
  maximumScoreRatingMismatchRate: 0,
  maximumFabricatedCriticalInputRate: 0,
};

export type CoverageSloMetrics = {
  sampleSize: number;
  discoveryRate: number;
  identityRate: number;
  classificationRate: number;
  supportCoverageRate: number;
  analysisCompletionRate: number;
  ratingEligibilityRate: number;
  engineErrorRate: number;
  directionalHighConflictRate: number;
  scoreRatingMismatchRate: number;
  fabricatedCriticalInputRate: number;
};

export type CoverageSloEvaluation = {
  pass: boolean;
  metrics: CoverageSloMetrics;
  violations: string[];
};

const SCORED_RATINGS = new Set(["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"]);

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function scoreRatingMismatch(record: CoverageAuditRecord): boolean {
  const scored = Boolean(record.rating && SCORED_RATINGS.has(record.rating));
  if (record.rating === "No Rating") return record.score !== null;
  if (scored) return typeof record.score !== "number" || !Number.isFinite(record.score);
  return record.score !== null;
}

function unresolvedHighConflict(record: CoverageAuditRecord): boolean {
  return (record.sourceConflicts ?? []).some((conflict) => conflict.severity === "high" && conflict.resolved !== true);
}

export function evaluateCoverageSlo(
  records: CoverageAuditRecord[],
  thresholds: CoverageSloThresholds = STOCKBOX_COVERAGE_SLO,
): CoverageSloEvaluation {
  const sampleSize = records.length;
  const undiscoveredStatuses: CoverageAuditStatus[] = ["input_invalid", "not_found", "no_exact_match"];
  const discovered = records.filter((record) => !undiscoveredStatuses.includes(record.status));
  const identityEligible = records.filter((record) => record.identityVerified !== null && record.identityVerified !== undefined);
  const classificationEligible = records.filter((record) => record.classificationVerified !== null && record.classificationVerified !== undefined);
  const supported = discovered.filter((record) => record.status !== "unsupported_security_type");
  const completed = records.filter((record) => record.status === "completed");
  const ratingEligible = completed.filter((record) => record.rating !== null && record.rating !== "No Rating");
  const engineErrors = records.filter((record) => record.status === "analysis_engine_error");
  const scored = records.filter((record) => Boolean(record.rating && SCORED_RATINGS.has(record.rating)));
  const scoredWithHighConflict = scored.filter(unresolvedHighConflict);
  const mismatches = records.filter(scoreRatingMismatch);
  const fabricated = records.filter((record) => (record.fabricatedCriticalInputs ?? 0) > 0);

  const metrics: CoverageSloMetrics = {
    sampleSize,
    discoveryRate: rate(discovered.length, sampleSize),
    identityRate: rate(identityEligible.filter((record) => record.identityVerified === true).length, identityEligible.length),
    classificationRate: rate(classificationEligible.filter((record) => record.classificationVerified === true).length, classificationEligible.length),
    supportCoverageRate: rate(supported.length, discovered.length),
    analysisCompletionRate: rate(completed.length, supported.length),
    ratingEligibilityRate: rate(ratingEligible.length, completed.length),
    engineErrorRate: rate(engineErrors.length, sampleSize),
    directionalHighConflictRate: rate(scoredWithHighConflict.length, scored.length),
    scoreRatingMismatchRate: rate(mismatches.length, sampleSize),
    fabricatedCriticalInputRate: rate(fabricated.length, sampleSize),
  };

  const violations: string[] = [];
  if (sampleSize === 0) violations.push("Coverage SLO cannot pass with an empty audit universe.");
  if (metrics.discoveryRate < thresholds.minimumDiscoveryRate) violations.push(`Discovery rate ${metrics.discoveryRate.toFixed(4)} is below ${thresholds.minimumDiscoveryRate.toFixed(4)}.`);
  if (identityEligible.length === 0) violations.push("Identity SLO cannot pass without verified identity labels.");
  else if (metrics.identityRate < thresholds.minimumIdentityRate) violations.push(`Identity rate ${metrics.identityRate.toFixed(4)} is below ${thresholds.minimumIdentityRate.toFixed(4)}.`);
  if (classificationEligible.length === 0) violations.push("Classification SLO cannot pass without verified classification labels.");
  else if (metrics.classificationRate < thresholds.minimumClassificationRate) violations.push(`Classification rate ${metrics.classificationRate.toFixed(4)} is below ${thresholds.minimumClassificationRate.toFixed(4)}.`);
  if (metrics.supportCoverageRate < thresholds.minimumSupportCoverageRate) violations.push(`Support coverage rate ${metrics.supportCoverageRate.toFixed(4)} is below ${thresholds.minimumSupportCoverageRate.toFixed(4)}.`);
  if (metrics.analysisCompletionRate < thresholds.minimumAnalysisCompletionRate) violations.push(`Analysis completion rate ${metrics.analysisCompletionRate.toFixed(4)} is below ${thresholds.minimumAnalysisCompletionRate.toFixed(4)}.`);
  if (metrics.engineErrorRate > thresholds.maximumEngineErrorRate) violations.push(`Engine error rate ${metrics.engineErrorRate.toFixed(4)} exceeds ${thresholds.maximumEngineErrorRate.toFixed(4)}.`);
  if (metrics.directionalHighConflictRate > thresholds.maximumDirectionalHighConflictRate) violations.push(`Scored high-conflict rate ${metrics.directionalHighConflictRate.toFixed(4)} exceeds ${thresholds.maximumDirectionalHighConflictRate.toFixed(4)}.`);
  if (metrics.scoreRatingMismatchRate > thresholds.maximumScoreRatingMismatchRate) violations.push(`Score/rating mismatch rate ${metrics.scoreRatingMismatchRate.toFixed(4)} exceeds ${thresholds.maximumScoreRatingMismatchRate.toFixed(4)}.`);
  if (metrics.fabricatedCriticalInputRate > thresholds.maximumFabricatedCriticalInputRate) violations.push(`Fabricated critical-input rate ${metrics.fabricatedCriticalInputRate.toFixed(4)} exceeds ${thresholds.maximumFabricatedCriticalInputRate.toFixed(4)}.`);

  return { pass: violations.length === 0, metrics, violations };
}

export function groupCoverageSlo(
  records: CoverageAuditRecord[],
  key: "region" | "instrumentType",
  thresholds: CoverageSloThresholds = STOCKBOX_COVERAGE_SLO,
): Record<string, CoverageSloEvaluation> {
  const groups = new Map<string, CoverageAuditRecord[]>();
  for (const record of records) {
    const value = record[key]?.trim() || "unknown";
    const bucket = groups.get(value) ?? [];
    bucket.push(record);
    groups.set(value, bucket);
  }
  return Object.fromEntries([...groups.entries()].map(([name, bucket]) => [name, evaluateCoverageSlo(bucket, thresholds)]));
}
