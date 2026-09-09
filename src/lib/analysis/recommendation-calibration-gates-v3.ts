import type { RecommendationCalibrationCandidateV3 } from "./recommendation-learning-v3";

export const CALIBRATION_BACKTEST_MIN_SAMPLE_V3 = 30;
export const CALIBRATION_SHADOW_MIN_SAMPLE_V3 = 30;
export const CALIBRATION_MIN_MEAN_EXCESS_IMPROVEMENT_V3 = 0.005;
export const CALIBRATION_MIN_HIT_RATE_IMPROVEMENT_V3 = 0.03;
export const CALIBRATION_MAX_HIT_RATE_REGRESSION_V3 = 0.05;
export const CALIBRATION_MAX_INTEGRITY_FAILURE_RATE_V3 = 0.02;

export type CalibrationEvaluationMetricsV3 = {
  sampleSize: number;
  benchmarkSampleSize: number;
  hitRate: number | null;
  meanExcessReturn: number | null;
  integrityFailureRate: number;
  safetyIncidentCount: number;
};

type CalibrationEvidenceBaseV3 = {
  candidateId: string;
  observedAt: string;
  analysisArchetype: string;
  modelVersion: string;
  recommendationPolicyVersion: string;
  variantFingerprint: string;
  datasetFingerprint: string;
  baseline: CalibrationEvaluationMetricsV3;
  variant: CalibrationEvaluationMetricsV3;
};

export type CalibrationBacktestEvidenceV3 = CalibrationEvidenceBaseV3 & {
  kind: "BACKTEST";
  frozenDataset: boolean;
};

export type CalibrationShadowEvidenceV3 = CalibrationEvidenceBaseV3 & {
  kind: "SHADOW";
  unseenSample: boolean;
  userVisible: boolean;
};

export type CalibrationEvidenceGateResultV3 = {
  passed: boolean;
  improved: boolean;
  reasonCodes: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validMetrics(metrics: CalibrationEvaluationMetricsV3): boolean {
  return Number.isInteger(metrics.sampleSize)
    && metrics.sampleSize >= 0
    && Number.isInteger(metrics.benchmarkSampleSize)
    && metrics.benchmarkSampleSize >= 0
    && metrics.benchmarkSampleSize <= metrics.sampleSize
    && (metrics.hitRate === null || (finite(metrics.hitRate) && metrics.hitRate >= 0 && metrics.hitRate <= 1))
    && (metrics.meanExcessReturn === null || finite(metrics.meanExcessReturn))
    && finite(metrics.integrityFailureRate)
    && metrics.integrityFailureRate >= 0
    && metrics.integrityFailureRate <= 1
    && Number.isInteger(metrics.safetyIncidentCount)
    && metrics.safetyIncidentCount >= 0;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function validateCommonEvidence(
  candidate: RecommendationCalibrationCandidateV3,
  evidence: CalibrationEvidenceBaseV3,
  minimumSample: number,
): string[] {
  const reasons: string[] = [];

  if (
    evidence.candidateId !== candidate.candidateId
    || evidence.analysisArchetype !== candidate.analysisArchetype
    || evidence.modelVersion !== candidate.modelVersion
    || evidence.recommendationPolicyVersion !== candidate.recommendationPolicyVersion
  ) {
    reasons.push("CALIBRATION_LINEAGE_MISMATCH");
  }

  if (!hasText(evidence.variantFingerprint)) reasons.push("VARIANT_FINGERPRINT_REQUIRED");
  if (!hasText(evidence.datasetFingerprint)) reasons.push("DATASET_FINGERPRINT_REQUIRED");
  if (!Number.isFinite(Date.parse(evidence.observedAt))) reasons.push("INVALID_EVIDENCE_TIMESTAMP");

  if (!validMetrics(evidence.baseline) || !validMetrics(evidence.variant)) {
    reasons.push("INVALID_EVALUATION_METRICS");
    return reasons;
  }

  if (evidence.baseline.sampleSize < minimumSample) reasons.push("INSUFFICIENT_BASELINE_SAMPLE");
  if (evidence.variant.sampleSize < minimumSample) reasons.push("INSUFFICIENT_VARIANT_SAMPLE");
  if (evidence.baseline.benchmarkSampleSize < minimumSample) reasons.push("INSUFFICIENT_BASELINE_BENCHMARK_SAMPLE");
  if (evidence.variant.benchmarkSampleSize < minimumSample) reasons.push("INSUFFICIENT_VARIANT_BENCHMARK_SAMPLE");

  if (
    evidence.baseline.sampleSize !== evidence.variant.sampleSize
    || evidence.baseline.benchmarkSampleSize !== evidence.variant.benchmarkSampleSize
  ) {
    reasons.push("EVALUATION_SAMPLE_MISMATCH");
  }

  if (evidence.variant.safetyIncidentCount > 0) reasons.push("SAFETY_INCIDENT_DETECTED");
  if (
    evidence.variant.integrityFailureRate > evidence.baseline.integrityFailureRate
    || evidence.variant.integrityFailureRate > CALIBRATION_MAX_INTEGRITY_FAILURE_RATE_V3
  ) {
    reasons.push("INTEGRITY_REGRESSION");
  }

  if (
    evidence.baseline.hitRate !== null
    && evidence.variant.hitRate !== null
    && evidence.variant.hitRate < evidence.baseline.hitRate - CALIBRATION_MAX_HIT_RATE_REGRESSION_V3
  ) {
    reasons.push("DIRECTIONAL_HIT_RATE_REGRESSION");
  }

  return reasons;
}

function materiallyImproved(evidence: CalibrationEvidenceBaseV3): boolean {
  const meanExcessImproved = evidence.baseline.meanExcessReturn !== null
    && evidence.variant.meanExcessReturn !== null
    && evidence.variant.meanExcessReturn - evidence.baseline.meanExcessReturn
      >= CALIBRATION_MIN_MEAN_EXCESS_IMPROVEMENT_V3;
  const hitRateImproved = evidence.baseline.hitRate !== null
    && evidence.variant.hitRate !== null
    && evidence.variant.hitRate - evidence.baseline.hitRate
      >= CALIBRATION_MIN_HIT_RATE_IMPROVEMENT_V3;
  return meanExcessImproved || hitRateImproved;
}

function finalize(reasons: string[], evidence: CalibrationEvidenceBaseV3): CalibrationEvidenceGateResultV3 {
  const improved = materiallyImproved(evidence);
  if (!improved) reasons.push("NO_MATERIAL_PERFORMANCE_IMPROVEMENT");
  return {
    passed: reasons.length === 0,
    improved,
    reasonCodes: [...new Set(reasons)],
  };
}

/**
 * Backtests are promotion evidence only when the comparison is reproducible:
 * same frozen sample, exact model lineage, enough benchmarked observations and
 * no safety/integrity regression. A boolean supplied by a caller is never
 * treated as evidence by this gate.
 */
export function evaluateCalibrationBacktestEvidenceV3(
  candidate: RecommendationCalibrationCandidateV3,
  evidence: CalibrationBacktestEvidenceV3,
): CalibrationEvidenceGateResultV3 {
  const reasons = validateCommonEvidence(candidate, evidence, CALIBRATION_BACKTEST_MIN_SAMPLE_V3);
  if (!evidence.frozenDataset) reasons.push("BACKTEST_DATASET_NOT_FROZEN");
  return finalize(reasons, evidence);
}

/**
 * Shadow validation must use unseen observations and the candidate variant may
 * never have influenced a user-visible recommendation. This keeps validation
 * observational until a separately approved production promotion occurs.
 */
export function evaluateCalibrationShadowEvidenceV3(
  candidate: RecommendationCalibrationCandidateV3,
  evidence: CalibrationShadowEvidenceV3,
): CalibrationEvidenceGateResultV3 {
  const reasons = validateCommonEvidence(candidate, evidence, CALIBRATION_SHADOW_MIN_SAMPLE_V3);
  if (!evidence.unseenSample) reasons.push("SHADOW_SAMPLE_NOT_UNSEEN");
  if (evidence.userVisible) reasons.push("SHADOW_VARIANT_WAS_USER_VISIBLE");
  return finalize(reasons, evidence);
}
