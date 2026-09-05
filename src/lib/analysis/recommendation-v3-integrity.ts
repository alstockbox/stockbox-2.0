import type { CoverageAssessment } from "./coverage-v3";
import type { DataAnomalyAssessmentV3, DataAnomalyV3Code } from "./data-anomaly-v3";
import {
  deriveRecommendationV3,
  type RecommendationDecisionV3,
  type RecommendationV3Options,
  type RecommendationV3Rating,
} from "./recommendation-v3";
import type { ScoreResult } from "./types";

const HARD_UNAVAILABLE_ANOMALIES = new Set<DataAnomalyV3Code>([
  "DATA_UNAVAILABLE",
  "FUTURE_DATED_FINANCIAL",
  "FINANCIAL_CURRENCY_MISMATCH",
  "NONFINITE_INPUT",
  "ENTITY_IDENTITY_UNCERTAIN",
]);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function constrainedRating(
  rating: RecommendationV3Rating,
  integrity: DataAnomalyAssessmentV3,
): { rating: RecommendationV3Rating; hardBlocked: boolean } {
  const blockingCodes = new Set(integrity.blockingAnomalies.map((item) => item.code));
  const hardBlocked = [...blockingCodes].some((code) => HARD_UNAVAILABLE_ANOMALIES.has(code));
  if (hardBlocked) return { rating: "UNAVAILABLE", hardBlocked: true };
  if (integrity.blockingAnomalies.length === 0) return { rating, hardBlocked: false };

  // Source/retrieval integrity problems can leave useful facts visible, but a
  // directional rating must wait until the conflict/outage is resolved.
  if (["STRONG_BUY", "BUY", "REDUCE", "SELL"].includes(rating)) {
    return { rating: "WAIT", hardBlocked: false };
  }
  return { rating, hardBlocked: false };
}

/**
 * Canonical Recommendation V3 entry point once Data Anomaly V3 is available.
 * The base recommendation remains deterministic; this wrapper only reduces
 * rating strength when system/data integrity cannot support the base output.
 */
export function deriveRecommendationV3WithIntegrity(
  score: ScoreResult,
  coverage: CoverageAssessment,
  integrity: DataAnomalyAssessmentV3,
  options: RecommendationV3Options = {},
): RecommendationDecisionV3 {
  const base = deriveRecommendationV3(score, coverage, options);
  if (integrity.anomalies.length === 0) return base;

  const constrained = constrainedRating(base.rating, integrity);
  const anomalyReasonCodes = integrity.anomalies.map((item) => `DATA_ANOMALY_${item.code}`);
  const blockingReasons = integrity.blockingAnomalies.map((item) => item.reason);
  const reasonCodes = unique([...base.confidenceGate.reasonCodes, ...anomalyReasonCodes]);
  const constraintsApplied = [...base.constraintsApplied];

  if (constrained.rating !== base.rating) {
    constraintsApplied.push(
      constrained.hardBlocked
        ? "Data-integrity policy blocks a directional recommendation until critical anomalies are resolved."
        : "Data-integrity policy caps directional recommendation strength at WAIT until blocking anomalies are resolved.",
    );
  }

  const conviction = constrained.hardBlocked
    ? 0
    : integrity.blockingAnomalies.length > 0
      ? Math.min(base.conviction, 35)
      : Math.min(base.conviction, integrity.integrityScore);

  return {
    ...base,
    rating: constrained.rating,
    conviction,
    dataQuality: Math.min(base.dataQuality, integrity.integrityScore),
    modelUncertainty: 100 - conviction,
    confidenceGate: {
      ...base.confidenceGate,
      passed: base.confidenceGate.passed && integrity.recommendationIntegrityEligible,
      hardBlocked: base.confidenceGate.hardBlocked || constrained.hardBlocked,
      reasons: unique([...base.confidenceGate.reasons, ...blockingReasons]),
      reasonCodes,
      maximumRating: constrained.hardBlocked
        ? "UNAVAILABLE"
        : integrity.blockingAnomalies.length > 0
          ? "WAIT"
          : base.confidenceGate.maximumRating,
    },
    rationale: [
      ...base.rationale,
      `Data integrity score is ${integrity.integrityScore}/100 under ${integrity.policyVersion}.`,
    ],
    constraintsApplied,
    audit: {
      ...base.audit,
      reasonCodes: unique([...base.audit.reasonCodes, ...anomalyReasonCodes]),
    },
  };
}
