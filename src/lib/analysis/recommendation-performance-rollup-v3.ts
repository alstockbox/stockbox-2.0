import type {
  RecommendationOutcomeHorizonV3,
  RecommendationOutcomeV3,
} from "./recommendation-learning-v3";
import type { RecommendationV3Rating } from "./recommendation-v3";

export type RecommendationPerformanceRollupScopeV3 = "BASE" | "ANALYSIS_ARCHETYPE" | "MODEL_LINEAGE";

export type RecommendationPerformanceRollupV3 = {
  scope: RecommendationPerformanceRollupScopeV3;
  horizon: RecommendationOutcomeHorizonV3;
  rating: RecommendationV3Rating;
  analysisArchetype: string | null;
  modelVersion: string | null;
  recommendationPolicyVersion: string | null;
  count: number;
  benchmarkCount: number;
  directionalCount: number;
  hitRate: number | null;
  meanSecurityReturn: number | null;
  meanExcessReturn: number | null;
  medianExcessReturn: number | null;
};

function finite(values: Array<number | null>): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function mean(values: number[]): number | null {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle] ?? null;
  return ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

function groupKey(parts: string[]): string {
  return JSON.stringify(parts);
}

function aggregate(
  scope: RecommendationPerformanceRollupScopeV3,
  outcomes: RecommendationOutcomeV3[],
): RecommendationPerformanceRollupV3 {
  const first = outcomes[0];
  if (!first) throw new Error("EMPTY_RECOMMENDATION_PERFORMANCE_ROLLUP");

  const excessReturns = finite(outcomes.map((outcome) => outcome.excessReturn));
  const directional = outcomes.filter((outcome): outcome is RecommendationOutcomeV3 & { directionalHit: boolean } =>
    typeof outcome.directionalHit === "boolean");

  return {
    scope,
    horizon: first.horizon,
    rating: first.rating,
    analysisArchetype: scope === "BASE" ? null : first.analysisArchetype,
    modelVersion: scope === "MODEL_LINEAGE" ? first.modelVersion : null,
    recommendationPolicyVersion: scope === "MODEL_LINEAGE" ? first.recommendationPolicyVersion : null,
    count: outcomes.length,
    benchmarkCount: excessReturns.length,
    directionalCount: directional.length,
    hitRate: directional.length > 0
      ? directional.filter((outcome) => outcome.directionalHit).length / directional.length
      : null,
    meanSecurityReturn: mean(finite(outcomes.map((outcome) => outcome.securityReturn))),
    meanExcessReturn: mean(excessReturns),
    medianExcessReturn: median(excessReturns),
  };
}

function collectGroups(
  outcomes: RecommendationOutcomeV3[],
  keyFor: (outcome: RecommendationOutcomeV3) => string,
): RecommendationOutcomeV3[][] {
  const groups = new Map<string, RecommendationOutcomeV3[]>();
  for (const outcome of outcomes) {
    const key = keyFor(outcome);
    groups.set(key, [...(groups.get(key) ?? []), outcome]);
  }
  return [...groups.values()];
}

/**
 * General performance reporting uses rating + horizon as the always-available
 * base slice. More specific dimensions are emitted only when they have enough
 * benchmark-relative evidence to avoid misleading small-sample fragmentation.
 *
 * Calibration intentionally does not consume these rollups: calibration keeps
 * exact model lineage isolation in `evaluateRecommendationPerformanceV3`.
 */
export function evaluateRecommendationPerformanceRollupsV3(
  outcomes: RecommendationOutcomeV3[],
  options: { minimumDimensionBenchmarkSample?: number } = {},
): RecommendationPerformanceRollupV3[] {
  const minimumDimensionBenchmarkSample = Math.max(20, options.minimumDimensionBenchmarkSample ?? 30);

  const baseGroups = collectGroups(outcomes, (outcome) => groupKey([
    outcome.horizon,
    outcome.rating,
  ]));
  const archetypeGroups = collectGroups(outcomes, (outcome) => groupKey([
    outcome.horizon,
    outcome.rating,
    outcome.analysisArchetype,
  ]));
  const lineageGroups = collectGroups(outcomes, (outcome) => groupKey([
    outcome.horizon,
    outcome.rating,
    outcome.analysisArchetype,
    outcome.modelVersion,
    outcome.recommendationPolicyVersion,
  ]));

  const base = baseGroups.map((group) => aggregate("BASE", group));
  const archetype = archetypeGroups
    .map((group) => aggregate("ANALYSIS_ARCHETYPE", group))
    .filter((rollup) => rollup.benchmarkCount >= minimumDimensionBenchmarkSample);
  const lineage = lineageGroups
    .map((group) => aggregate("MODEL_LINEAGE", group))
    .filter((rollup) => rollup.benchmarkCount >= minimumDimensionBenchmarkSample);

  return [...base, ...archetype, ...lineage].sort((left, right) => {
    const scopeOrder: Record<RecommendationPerformanceRollupScopeV3, number> = {
      BASE: 0,
      ANALYSIS_ARCHETYPE: 1,
      MODEL_LINEAGE: 2,
    };
    const scopeDelta = scopeOrder[left.scope] - scopeOrder[right.scope];
    if (scopeDelta !== 0) return scopeDelta;
    const horizonDelta = left.horizon.localeCompare(right.horizon);
    if (horizonDelta !== 0) return horizonDelta;
    const ratingDelta = left.rating.localeCompare(right.rating);
    if (ratingDelta !== 0) return ratingDelta;
    const archetypeDelta = (left.analysisArchetype ?? "").localeCompare(right.analysisArchetype ?? "");
    if (archetypeDelta !== 0) return archetypeDelta;
    const modelDelta = (left.modelVersion ?? "").localeCompare(right.modelVersion ?? "");
    if (modelDelta !== 0) return modelDelta;
    return (left.recommendationPolicyVersion ?? "").localeCompare(right.recommendationPolicyVersion ?? "");
  });
}
