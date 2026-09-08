import type { RecommendationV3Rating } from "./recommendation-v3";

export const RECOMMENDATION_LIFECYCLE_POLICY_VERSION = "stockbox-recommendation-lifecycle-v3.0.0" as const;

export type RecommendationLifecycleStateV3 =
  | "NEW"
  | "ACTIVE"
  | "STRENGTHENED"
  | "WEAKENED"
  | "UPGRADED"
  | "DOWNGRADED"
  | "CLOSED";

export type RecommendationLifecycleSnapshotV3 = {
  snapshotId: string;
  ticker: string;
  observedAt: string;
  rating: RecommendationV3Rating;
  objectiveScore: number | null;
  conviction: number;
  dataQuality: number;
  modelUncertainty: number;
};

export type RecommendationLifecycleEventV3 = {
  policyVersion: typeof RECOMMENDATION_LIFECYCLE_POLICY_VERSION;
  state: RecommendationLifecycleStateV3;
  ticker: string;
  previousSnapshotId: string | null;
  currentSnapshotId: string;
  observedAt: string;
  previousRating: RecommendationV3Rating | null;
  currentRating: RecommendationV3Rating;
  direction: "supports" | "weakens" | "neutral";
  severity: "info" | "watch" | "important";
  material: boolean;
  reconsider: boolean;
  scoreDelta: number | null;
  convictionDelta: number;
  dataQualityDelta: number;
  modelUncertaintyDelta: number;
  reasonCodes: string[];
};

const RATING_RANK: Record<RecommendationV3Rating, number | null> = {
  SELL: 0,
  REDUCE: 1,
  WAIT: 2,
  HOLD: 2,
  BUY: 3,
  STRONG_BUY: 4,
  UNAVAILABLE: null,
};

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deltaOrNull(previous: number | null, current: number | null): number | null {
  const before = finiteOrNull(previous);
  const after = finiteOrNull(current);
  return before === null || after === null ? null : after - before;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function rankDelta(previous: RecommendationV3Rating, current: RecommendationV3Rating): number | null {
  const before = RATING_RANK[previous];
  const after = RATING_RANK[current];
  return before === null || after === null ? null : after - before;
}

export function deriveRecommendationLifecycleV3(
  previous: RecommendationLifecycleSnapshotV3 | null,
  current: RecommendationLifecycleSnapshotV3,
): RecommendationLifecycleEventV3 {
  const ticker = normalizeTicker(current.ticker);
  if (!ticker) throw new Error("RECOMMENDATION_LIFECYCLE_TICKER_REQUIRED");

  if (previous && normalizeTicker(previous.ticker) !== ticker) {
    throw new Error("RECOMMENDATION_LIFECYCLE_TICKER_MISMATCH");
  }

  const scoreDelta = previous ? deltaOrNull(previous.objectiveScore, current.objectiveScore) : null;
  const convictionDelta = previous ? finite(current.conviction) - finite(previous.conviction) : 0;
  const dataQualityDelta = previous ? finite(current.dataQuality) - finite(previous.dataQuality) : 0;
  const modelUncertaintyDelta = previous
    ? finite(current.modelUncertainty) - finite(previous.modelUncertainty)
    : 0;

  const base = {
    policyVersion: RECOMMENDATION_LIFECYCLE_POLICY_VERSION,
    ticker,
    previousSnapshotId: previous?.snapshotId ?? null,
    currentSnapshotId: current.snapshotId,
    observedAt: current.observedAt,
    previousRating: previous?.rating ?? null,
    currentRating: current.rating,
    scoreDelta,
    convictionDelta,
    dataQualityDelta,
    modelUncertaintyDelta,
  };

  if (!previous || previous.rating === "UNAVAILABLE" && current.rating !== "UNAVAILABLE") {
    return {
      ...base,
      state: "NEW",
      direction: "neutral",
      severity: "watch",
      material: true,
      reconsider: false,
      reasonCodes: previous ? ["RECOMMENDATION_BECAME_AVAILABLE"] : ["FIRST_OBJECTIVE_RECOMMENDATION"],
    };
  }

  if (current.rating === "UNAVAILABLE" && previous.rating !== "UNAVAILABLE") {
    return {
      ...base,
      state: "CLOSED",
      direction: "weakens",
      severity: "important",
      material: true,
      reconsider: true,
      reasonCodes: ["RECOMMENDATION_BECAME_UNAVAILABLE"],
    };
  }

  const ratingChange = rankDelta(previous.rating, current.rating);
  if (previous.rating !== current.rating && ratingChange !== null && ratingChange !== 0) {
    const upgraded = ratingChange > 0;
    return {
      ...base,
      state: upgraded ? "UPGRADED" : "DOWNGRADED",
      direction: upgraded ? "supports" : "weakens",
      severity: Math.abs(ratingChange) >= 2 ? "important" : "watch",
      material: true,
      reconsider: !upgraded,
      reasonCodes: [upgraded ? "OBJECTIVE_RATING_UPGRADED" : "OBJECTIVE_RATING_DOWNGRADED"],
    };
  }

  const strengthening = (scoreDelta !== null && scoreDelta >= 5)
    || convictionDelta >= 10
    || dataQualityDelta >= 15
    || modelUncertaintyDelta <= -15;
  const weakening = (scoreDelta !== null && scoreDelta <= -5)
    || convictionDelta <= -10
    || dataQualityDelta <= -15
    || modelUncertaintyDelta >= 15;

  if (strengthening && !weakening) {
    const reasons: string[] = [];
    if (scoreDelta !== null && scoreDelta >= 5) reasons.push("OBJECTIVE_SCORE_IMPROVED");
    if (convictionDelta >= 10) reasons.push("CONVICTION_IMPROVED");
    if (dataQualityDelta >= 15) reasons.push("DATA_QUALITY_IMPROVED");
    if (modelUncertaintyDelta <= -15) reasons.push("MODEL_UNCERTAINTY_DECLINED");
    return {
      ...base,
      state: "STRENGTHENED",
      direction: "supports",
      severity: "watch",
      material: true,
      reconsider: false,
      reasonCodes: reasons,
    };
  }

  if (weakening && !strengthening) {
    const reasons: string[] = [];
    if (scoreDelta !== null && scoreDelta <= -5) reasons.push("OBJECTIVE_SCORE_WEAKENED");
    if (convictionDelta <= -10) reasons.push("CONVICTION_WEAKENED");
    if (dataQualityDelta <= -15) reasons.push("DATA_QUALITY_WEAKENED");
    if (modelUncertaintyDelta >= 15) reasons.push("MODEL_UNCERTAINTY_INCREASED");
    const important = (scoreDelta !== null && scoreDelta <= -12)
      || convictionDelta <= -20
      || dataQualityDelta <= -25
      || modelUncertaintyDelta >= 25;
    return {
      ...base,
      state: "WEAKENED",
      direction: "weakens",
      severity: important ? "important" : "watch",
      material: true,
      reconsider: true,
      reasonCodes: reasons,
    };
  }

  return {
    ...base,
    state: "ACTIVE",
    direction: "neutral",
    severity: "info",
    material: false,
    reconsider: false,
    reasonCodes: strengthening && weakening
      ? ["MIXED_MATERIAL_SIGNALS_NO_DIRECTIONAL_LIFECYCLE_CHANGE"]
      : ["NO_MATERIAL_OBJECTIVE_CHANGE"],
  };
}
