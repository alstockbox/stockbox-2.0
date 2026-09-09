import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import {
  RECOMMENDATION_OUTCOME_POLICY_VERSION,
  type RecommendationOutcomeHorizonV3,
} from "@/lib/analysis/recommendation-learning-v3";
import type {
  RecommendationPerformanceRollupScopeV3,
  RecommendationPerformanceRollupV3,
} from "@/lib/analysis/recommendation-performance-rollup-v3";
import type { RecommendationV3Rating } from "@/lib/analysis/recommendation-v3";
import { createAdminClient } from "@/lib/supabase/admin";

export type RecommendationPerformanceRollupRowV3 = {
  scope: RecommendationPerformanceRollupScopeV3;
  horizon: RecommendationOutcomeHorizonV3;
  rating: RecommendationV3Rating;
  sector: string | null;
  analysis_archetype: string | null;
  model_version: string | null;
  recommendation_policy_version: string | null;
  outcome_policy_version: typeof RECOMMENDATION_OUTCOME_POLICY_VERSION;
  benchmark_policy_version: typeof RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3;
  source_limit: number;
  dimension_sample_gate: number;
  sample_count: number;
  benchmark_count: number;
  directional_count: number;
  hit_rate: number | null;
  mean_security_return: number | null;
  mean_excess_return: number | null;
  median_excess_return: number | null;
  evaluated_at: string;
  updated_at: string;
};

export type RecommendationPerformanceRollupPersistenceOptionsV3 = {
  sourceLimit: number;
  dimensionSampleGate: number;
  evaluatedAt: string;
};

function normalizeDimension(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizedSourceLimit(value: number): number {
  return Math.max(30, Math.min(Math.trunc(value), 20_000));
}

function normalizedDimensionSampleGate(value: number): number {
  return Math.max(20, Math.trunc(value));
}

/**
 * Explicit mapper for a derived, privacy-minimized read-model. The immutable raw
 * outcome rows remain source of truth; this row records enough policy/window
 * lineage to reproduce the materialized aggregate without user or portfolio data.
 */
export function toRecommendationPerformanceRollupRowV3(
  rollup: RecommendationPerformanceRollupV3,
  options: RecommendationPerformanceRollupPersistenceOptionsV3,
): RecommendationPerformanceRollupRowV3 {
  return {
    scope: rollup.scope,
    horizon: rollup.horizon,
    rating: rollup.rating,
    sector: normalizeDimension(rollup.sector),
    analysis_archetype: normalizeDimension(rollup.analysisArchetype),
    model_version: normalizeDimension(rollup.modelVersion),
    recommendation_policy_version: normalizeDimension(rollup.recommendationPolicyVersion),
    outcome_policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
    source_limit: normalizedSourceLimit(options.sourceLimit),
    dimension_sample_gate: normalizedDimensionSampleGate(options.dimensionSampleGate),
    sample_count: Math.max(0, Math.trunc(rollup.count)),
    benchmark_count: Math.max(0, Math.trunc(rollup.benchmarkCount)),
    directional_count: Math.max(0, Math.trunc(rollup.directionalCount)),
    hit_rate: rollup.hitRate,
    mean_security_return: rollup.meanSecurityReturn,
    mean_excess_return: rollup.meanExcessReturn,
    median_excess_return: rollup.medianExcessReturn,
    evaluated_at: options.evaluatedAt,
    updated_at: options.evaluatedAt,
  };
}

export type RecommendationPerformanceRollupPersistResultV3 =
  | { ok: true; configured: true; persisted: number }
  | { ok: false; configured: false; persisted: 0; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; persisted: 0; error: string };

/**
 * Materializes one complete rollup evaluation atomically. A failed batch writes
 * no partial read-model from this call, while raw outcomes remain untouched.
 */
export async function persistRecommendationPerformanceRollupsV3(
  rollups: RecommendationPerformanceRollupV3[],
  options: RecommendationPerformanceRollupPersistenceOptionsV3,
): Promise<RecommendationPerformanceRollupPersistResultV3> {
  if (rollups.length === 0) return { ok: true, configured: true, persisted: 0 };

  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, configured: false, persisted: 0, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };
  }

  try {
    const rows = rollups.map((rollup) => toRecommendationPerformanceRollupRowV3(rollup, options));
    const { error } = await supabase
      .from("analysis_recommendation_v3_performance_rollups")
      .upsert(rows, {
        onConflict: [
          "scope",
          "horizon",
          "rating",
          "sector",
          "analysis_archetype",
          "model_version",
          "recommendation_policy_version",
          "outcome_policy_version",
          "benchmark_policy_version",
          "source_limit",
          "dimension_sample_gate",
        ].join(","),
        ignoreDuplicates: false,
      });

    if (error) return { ok: false, configured: true, persisted: 0, error: error.message };
    return { ok: true, configured: true, persisted: rows.length };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      persisted: 0,
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_PERFORMANCE_ROLLUP_PERSISTENCE_ERROR",
    };
  }
}
