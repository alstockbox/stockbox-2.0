import type { RecommendationV3ShadowEvent } from "./recommendation-v3-shadow";
import type { RecommendationV3Rating } from "./recommendation-v3";

export const RECOMMENDATION_OUTCOME_POLICY_VERSION = "stockbox-recommendation-outcomes-v3.0.0" as const;
export const RECOMMENDATION_CALIBRATION_POLICY_VERSION = "stockbox-recommendation-calibration-v3.0.0" as const;

export const RECOMMENDATION_OUTCOME_HORIZONS_V3 = ["1d", "7d", "30d", "90d", "180d", "1y"] as const;
export type RecommendationOutcomeHorizonV3 = (typeof RECOMMENDATION_OUTCOME_HORIZONS_V3)[number];

const HORIZON_DAYS: Record<RecommendationOutcomeHorizonV3, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "1y": 365,
};

const DAY_MS = 86_400_000;

export type RecommendationSnapshotV3 = {
  snapshotId: string;
  observedAt: string;
  ticker: string;
  analysisFingerprint: string | null;
  analysisArchetype: string;
  /** Optional objective sector lineage. Missing/legacy values remain null. */
  sector?: string | null;
  modelVersion: string;
  recommendationPolicyVersion: string;
  rating: RecommendationV3Rating;
  objectiveScore: number | null;
  conviction: number;
  dataQuality: number;
  modelUncertainty: number;
  reasonCodes: string[];
};

export type RecommendationOutcomePriceObservationV3 = {
  observedAt: string;
  price: number;
  benchmarkPrice?: number | null;
};

export type RecommendationOutcomeV3 = {
  policyVersion: typeof RECOMMENDATION_OUTCOME_POLICY_VERSION;
  snapshotId: string;
  ticker: string;
  rating: RecommendationV3Rating;
  analysisArchetype: string;
  /** Optional objective sector lineage. It is reporting-only, never inferred. */
  sector?: string | null;
  modelVersion: string;
  recommendationPolicyVersion: string;
  horizon: RecommendationOutcomeHorizonV3;
  expectedAt: string;
  evaluatedAt: string;
  lagDays: number;
  entryPrice: number;
  observedPrice: number;
  securityReturn: number;
  benchmarkTicker: string | null;
  benchmarkEntryPrice: number | null;
  benchmarkObservedPrice: number | null;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  directionalHit: boolean | null;
  conviction: number;
  dataQuality: number;
};

export type RecommendationPerformanceSliceV3 = {
  horizon: RecommendationOutcomeHorizonV3;
  rating: RecommendationV3Rating;
  analysisArchetype: string;
  modelVersion: string;
  recommendationPolicyVersion: string;
  count: number;
  benchmarkCount: number;
  directionalCount: number;
  hitRate: number | null;
  meanSecurityReturn: number | null;
  meanExcessReturn: number | null;
  medianExcessReturn: number | null;
};

export type RecommendationCalibrationStageV3 =
  | "CANDIDATE"
  | "BACKTESTED"
  | "SHADOW_VALIDATED"
  | "APPROVED"
  | "PRODUCTION";

export type RecommendationCalibrationCandidateV3 = {
  policyVersion: typeof RECOMMENDATION_CALIBRATION_POLICY_VERSION;
  candidateId: string;
  createdAt: string;
  stage: RecommendationCalibrationStageV3;
  horizon: RecommendationOutcomeHorizonV3;
  rating: RecommendationV3Rating;
  analysisArchetype: string;
  modelVersion: string;
  recommendationPolicyVersion: string;
  sampleSize: number;
  benchmarkSampleSize: number;
  hitRate: number | null;
  meanExcessReturn: number | null;
  /** Nullable for missing benchmark evidence; optional only for legacy candidate artifacts. */
  medianExcessReturn?: number | null;
  reasons: string[];
};

export type CalibrationPromotionEvidenceV3 = {
  backtestImproved?: boolean;
  shadowImproved?: boolean;
  explicitApproval?: boolean;
};

function validPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizedTicker(value: string): string {
  return value.trim().toUpperCase();
}

function normalizedDimension(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function mean(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle] ?? null;
  return ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

function parseDate(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function expectedAt(snapshot: RecommendationSnapshotV3, horizon: RecommendationOutcomeHorizonV3): string {
  const start = parseDate(snapshot.observedAt);
  if (start === null) throw new Error("INVALID_RECOMMENDATION_SNAPSHOT_DATE");
  return new Date(start + HORIZON_DAYS[horizon] * DAY_MS).toISOString();
}

function returnFromPrices(entry: number, observed: number): number {
  return observed / entry - 1;
}

function directionForRating(rating: RecommendationV3Rating): -1 | 0 | 1 {
  if (rating === "STRONG_BUY" || rating === "BUY") return 1;
  if (rating === "REDUCE" || rating === "SELL") return -1;
  return 0;
}

function stableSnapshotId(event: RecommendationV3ShadowEvent): string {
  const fingerprint = event.analysisFingerprint?.trim() || event.observedAt;
  return [
    normalizedTicker(event.ticker),
    fingerprint,
    event.modelVersion,
    event.recommendationPolicyVersion,
  ].join(":");
}

/**
 * Converts privacy-minimized objective shadow telemetry into an immutable learning snapshot.
 * Personalized/user-match values are intentionally not part of the contract.
 */
export function createRecommendationSnapshotV3(event: RecommendationV3ShadowEvent): RecommendationSnapshotV3 {
  return Object.freeze({
    snapshotId: stableSnapshotId(event),
    observedAt: event.observedAt,
    ticker: normalizedTicker(event.ticker),
    analysisFingerprint: event.analysisFingerprint,
    analysisArchetype: event.analysisArchetype,
    sector: normalizedDimension(event.sector),
    modelVersion: event.modelVersion,
    recommendationPolicyVersion: event.recommendationPolicyVersion,
    rating: event.v3Rating,
    objectiveScore: event.objectiveScore,
    conviction: event.conviction,
    dataQuality: event.dataQuality,
    modelUncertainty: event.modelUncertainty,
    reasonCodes: Object.freeze([...event.reasonCodes]) as unknown as string[],
  });
}

export function recommendationOutcomeExpectedAtV3(
  snapshot: RecommendationSnapshotV3,
  horizon: RecommendationOutcomeHorizonV3,
): string {
  return expectedAt(snapshot, horizon);
}

export function isRecommendationOutcomeDueV3(
  snapshot: RecommendationSnapshotV3,
  horizon: RecommendationOutcomeHorizonV3,
  now: string,
): boolean {
  const current = parseDate(now);
  if (current === null) return false;
  return current >= Date.parse(expectedAt(snapshot, horizon));
}

export function evaluateRecommendationOutcomeV3(input: {
  snapshot: RecommendationSnapshotV3;
  horizon: RecommendationOutcomeHorizonV3;
  entryPrice: number;
  observation: RecommendationOutcomePriceObservationV3;
  benchmarkTicker?: string | null;
  benchmarkEntryPrice?: number | null;
}): RecommendationOutcomeV3 | null {
  const { snapshot, horizon, entryPrice, observation } = input;
  if (!validPrice(entryPrice) || !validPrice(observation.price)) return null;

  const target = expectedAt(snapshot, horizon);
  const targetMs = Date.parse(target);
  const evaluatedMs = parseDate(observation.observedAt);
  if (evaluatedMs === null || evaluatedMs < targetMs) return null;

  const securityReturn = returnFromPrices(entryPrice, observation.price);
  const benchmarkEntry = validPrice(input.benchmarkEntryPrice) ? input.benchmarkEntryPrice : null;
  const benchmarkObserved = validPrice(observation.benchmarkPrice) ? observation.benchmarkPrice : null;
  const benchmarkReturn = benchmarkEntry !== null && benchmarkObserved !== null
    ? returnFromPrices(benchmarkEntry, benchmarkObserved)
    : null;
  const excessReturn = benchmarkReturn === null ? null : securityReturn - benchmarkReturn;
  const direction = directionForRating(snapshot.rating);
  const directionalHit = direction === 0 || excessReturn === null
    ? null
    : direction * excessReturn > 0;

  return {
    policyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    snapshotId: snapshot.snapshotId,
    ticker: snapshot.ticker,
    rating: snapshot.rating,
    analysisArchetype: snapshot.analysisArchetype,
    sector: normalizedDimension(snapshot.sector),
    modelVersion: snapshot.modelVersion,
    recommendationPolicyVersion: snapshot.recommendationPolicyVersion,
    horizon,
    expectedAt: target,
    evaluatedAt: observation.observedAt,
    lagDays: Math.max(0, Math.round((evaluatedMs - targetMs) / DAY_MS)),
    entryPrice,
    observedPrice: observation.price,
    securityReturn,
    benchmarkTicker: input.benchmarkTicker?.trim().toUpperCase() || null,
    benchmarkEntryPrice: benchmarkEntry,
    benchmarkObservedPrice: benchmarkObserved,
    benchmarkReturn,
    excessReturn,
    directionalHit,
    conviction: snapshot.conviction,
    dataQuality: snapshot.dataQuality,
  };
}

export function evaluateRecommendationPerformanceV3(
  outcomes: RecommendationOutcomeV3[],
): RecommendationPerformanceSliceV3[] {
  const keys = new Map<string, RecommendationOutcomeV3[]>();
  for (const outcome of outcomes) {
    const key = [
      outcome.horizon,
      outcome.rating,
      outcome.analysisArchetype,
      outcome.modelVersion,
      outcome.recommendationPolicyVersion,
    ].join(":");
    keys.set(key, [...(keys.get(key) ?? []), outcome]);
  }

  return [...keys.values()]
    .map((items) => {
      const first = items[0];
      if (!first) throw new Error("EMPTY_RECOMMENDATION_PERFORMANCE_SLICE");
      const benchmarked = items.filter((item): item is RecommendationOutcomeV3 & { excessReturn: number } =>
        typeof item.excessReturn === "number" && Number.isFinite(item.excessReturn));
      const directional = items.filter((item): item is RecommendationOutcomeV3 & { directionalHit: boolean } =>
        typeof item.directionalHit === "boolean");
      return {
        horizon: first.horizon,
        rating: first.rating,
        analysisArchetype: first.analysisArchetype,
        modelVersion: first.modelVersion,
        recommendationPolicyVersion: first.recommendationPolicyVersion,
        count: items.length,
        benchmarkCount: benchmarked.length,
        directionalCount: directional.length,
        hitRate: directional.length ? directional.filter((item) => item.directionalHit).length / directional.length : null,
        meanSecurityReturn: mean(items.map((item) => item.securityReturn)),
        meanExcessReturn: mean(benchmarked.map((item) => item.excessReturn)),
        medianExcessReturn: median(benchmarked.map((item) => item.excessReturn)),
      } satisfies RecommendationPerformanceSliceV3;
    })
    .sort((left, right) => {
      const horizonDelta = RECOMMENDATION_OUTCOME_HORIZONS_V3.indexOf(left.horizon)
        - RECOMMENDATION_OUTCOME_HORIZONS_V3.indexOf(right.horizon);
      if (horizonDelta !== 0) return horizonDelta;
      const archetypeDelta = left.analysisArchetype.localeCompare(right.analysisArchetype);
      if (archetypeDelta !== 0) return archetypeDelta;
      const modelDelta = left.modelVersion.localeCompare(right.modelVersion);
      if (modelDelta !== 0) return modelDelta;
      const policyDelta = left.recommendationPolicyVersion.localeCompare(right.recommendationPolicyVersion);
      if (policyDelta !== 0) return policyDelta;
      return left.rating.localeCompare(right.rating);
    });
}

/**
 * Creates a review candidate only when a sufficiently large benchmarked sample indicates drift.
 * This is an evaluation artifact, never a production parameter mutation.
 */
export function proposeRecommendationCalibrationV3(
  performance: RecommendationPerformanceSliceV3,
  options: { minimumBenchmarkSample?: number; createdAt?: string } = {},
): RecommendationCalibrationCandidateV3 | null {
  const minimumBenchmarkSample = Math.max(20, options.minimumBenchmarkSample ?? 30);
  if (performance.benchmarkCount < minimumBenchmarkSample) return null;

  const reasons: string[] = [];
  if (performance.meanExcessReturn !== null && performance.meanExcessReturn < -0.02) {
    reasons.push("MEAN_EXCESS_RETURN_BELOW_MINUS_2_PERCENT");
  }
  if (performance.directionalCount >= minimumBenchmarkSample
      && performance.hitRate !== null
      && performance.hitRate < 0.45) {
    reasons.push("DIRECTIONAL_HIT_RATE_BELOW_45_PERCENT");
  }
  if (performance.benchmarkCount >= 50
      && performance.hitRate !== null
      && performance.hitRate < 0.50
      && performance.meanExcessReturn !== null
      && performance.meanExcessReturn < 0) {
    reasons.push("MODEL_DRIFT_REVIEW_REQUIRED");
  }
  if (performance.benchmarkCount >= 80
      && performance.hitRate !== null
      && performance.hitRate < 0.40
      && performance.meanExcessReturn !== null
      && performance.meanExcessReturn < -0.03) {
    reasons.push("SEVERE_MODEL_DRIFT");
  }

  if (reasons.length === 0) return null;

  const createdAt = options.createdAt ?? new Date().toISOString();
  const candidateId = [
    performance.horizon,
    performance.rating,
    performance.analysisArchetype,
    performance.modelVersion,
    performance.recommendationPolicyVersion,
    reasons.join("+"),
  ].join(":");

  return {
    policyVersion: RECOMMENDATION_CALIBRATION_POLICY_VERSION,
    candidateId,
    createdAt,
    stage: "CANDIDATE",
    horizon: performance.horizon,
    rating: performance.rating,
    analysisArchetype: performance.analysisArchetype,
    modelVersion: performance.modelVersion,
    recommendationPolicyVersion: performance.recommendationPolicyVersion,
    sampleSize: performance.count,
    benchmarkSampleSize: performance.benchmarkCount,
    hitRate: performance.hitRate,
    meanExcessReturn: performance.meanExcessReturn,
    medianExcessReturn: performance.medianExcessReturn,
    reasons,
  };
}

export function canPromoteRecommendationCalibrationV3(
  stage: RecommendationCalibrationStageV3,
  evidence: CalibrationPromotionEvidenceV3,
): RecommendationCalibrationStageV3 {
  if (stage === "CANDIDATE") return evidence.backtestImproved ? "BACKTESTED" : "CANDIDATE";
  if (stage === "BACKTESTED") return evidence.shadowImproved ? "SHADOW_VALIDATED" : "BACKTESTED";
  if (stage === "SHADOW_VALIDATED") return evidence.explicitApproval ? "APPROVED" : "SHADOW_VALIDATED";
  if (stage === "APPROVED") return "PRODUCTION";
  return "PRODUCTION";
}
