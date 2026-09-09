import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import {
  RECOMMENDATION_OUTCOME_HORIZONS_V3,
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
 * Atomically replaces the complete materialized snapshot for one exact
 * policy/window/sample-gate lineage. The RPC deletes stale members and inserts
 * the new set inside one PostgreSQL transaction; an empty set therefore clears
 * the prior snapshot instead of silently preserving obsolete dimensions.
 * Immutable raw outcomes remain the source of truth.
 */
export async function persistRecommendationPerformanceRollupsV3(
  rollups: RecommendationPerformanceRollupV3[],
  options: RecommendationPerformanceRollupPersistenceOptionsV3,
): Promise<RecommendationPerformanceRollupPersistResultV3> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, configured: false, persisted: 0, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };
  }

  try {
    const sourceLimit = normalizedSourceLimit(options.sourceLimit);
    const dimensionSampleGate = normalizedDimensionSampleGate(options.dimensionSampleGate);
    const normalizedOptions = {
      ...options,
      sourceLimit,
      dimensionSampleGate,
    };
    const rows = rollups.map((rollup) => toRecommendationPerformanceRollupRowV3(rollup, normalizedOptions));
    const { data, error } = await supabase.rpc("replace_recommendation_v3_performance_rollups", {
      p_rows: rows,
      p_outcome_policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
      p_benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
      p_source_limit: sourceLimit,
      p_dimension_sample_gate: dimensionSampleGate,
      p_evaluated_at: options.evaluatedAt,
    });

    if (error) return { ok: false, configured: true, persisted: 0, error: error.message };
    const persisted = typeof data === "number" && Number.isFinite(data)
      ? Math.max(0, Math.trunc(data))
      : rows.length;
    return { ok: true, configured: true, persisted };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      persisted: 0,
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_PERFORMANCE_ROLLUP_PERSISTENCE_ERROR",
    };
  }
}

const PERFORMANCE_ROLLUP_SCOPES_V3 = new Set<RecommendationPerformanceRollupScopeV3>([
  "BASE",
  "SECTOR",
  "ANALYSIS_ARCHETYPE",
  "MODEL_LINEAGE",
]);
const PERFORMANCE_ROLLUP_HORIZONS_V3 = new Set<RecommendationOutcomeHorizonV3>(RECOMMENDATION_OUTCOME_HORIZONS_V3);
const PERFORMANCE_ROLLUP_RATINGS_V3 = new Set<RecommendationV3Rating>([
  "STRONG_BUY",
  "BUY",
  "WAIT",
  "HOLD",
  "REDUCE",
  "SELL",
  "UNAVAILABLE",
]);

export type RecommendationPerformanceRollupReadRowV3 = {
  scope: RecommendationPerformanceRollupScopeV3;
  horizon: RecommendationOutcomeHorizonV3;
  rating: RecommendationV3Rating;
  sector: string | null;
  analysisArchetype: string | null;
  modelVersion: string | null;
  recommendationPolicyVersion: string | null;
  sampleCount: number;
  benchmarkCount: number;
  directionalCount: number;
  hitRate: number | null;
  meanSecurityReturn: number | null;
  meanExcessReturn: number | null;
  medianExcessReturn: number | null;
  evaluatedAt: string;
};

export type RecommendationPerformanceRollupSnapshotV3 = {
  evaluatedAt: string;
  outcomePolicyVersion: typeof RECOMMENDATION_OUTCOME_POLICY_VERSION;
  benchmarkPolicyVersion: typeof RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3;
  sourceLimit: number;
  dimensionSampleGate: number;
  rollups: RecommendationPerformanceRollupReadRowV3[];
};

export type RecommendationPerformanceRollupReadResultV3 =
  | { ok: true; configured: true; snapshot: RecommendationPerformanceRollupSnapshotV3 | null }
  | { ok: false; configured: false; snapshot: null; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; snapshot: null; error: string };

function persistenceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function strictNullableDimension(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function strictNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function strictNullableFiniteNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function dimensionsMatchScope(
  scope: RecommendationPerformanceRollupScopeV3,
  sector: string | null,
  analysisArchetype: string | null,
  modelVersion: string | null,
  recommendationPolicyVersion: string | null,
): boolean {
  if (scope === "BASE") {
    return sector === null && analysisArchetype === null && modelVersion === null && recommendationPolicyVersion === null;
  }
  if (scope === "SECTOR") {
    return sector !== null && analysisArchetype === null && modelVersion === null && recommendationPolicyVersion === null;
  }
  if (scope === "ANALYSIS_ARCHETYPE") {
    return sector === null && analysisArchetype !== null && modelVersion === null && recommendationPolicyVersion === null;
  }
  return sector === null
    && analysisArchetype !== null
    && modelVersion !== null
    && recommendationPolicyVersion !== null;
}

function parseRecommendationPerformanceRollupReadRowV3(
  value: unknown,
  lineage: {
    evaluatedAt: string;
    sourceLimit: number;
    dimensionSampleGate: number;
  },
): RecommendationPerformanceRollupReadRowV3 | null {
  const row = persistenceRecord(value);
  if (!row) return null;
  if (typeof row.scope !== "string" || !PERFORMANCE_ROLLUP_SCOPES_V3.has(row.scope as RecommendationPerformanceRollupScopeV3)) return null;
  if (typeof row.horizon !== "string" || !PERFORMANCE_ROLLUP_HORIZONS_V3.has(row.horizon as RecommendationOutcomeHorizonV3)) return null;
  if (typeof row.rating !== "string" || !PERFORMANCE_ROLLUP_RATINGS_V3.has(row.rating as RecommendationV3Rating)) return null;
  if (row.outcome_policy_version !== RECOMMENDATION_OUTCOME_POLICY_VERSION) return null;
  if (row.benchmark_policy_version !== RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3) return null;
  if (row.source_limit !== lineage.sourceLimit || row.dimension_sample_gate !== lineage.dimensionSampleGate) return null;
  if (!validTimestamp(row.evaluated_at) || row.evaluated_at !== lineage.evaluatedAt) return null;

  const sector = strictNullableDimension(row.sector);
  const analysisArchetype = strictNullableDimension(row.analysis_archetype);
  const modelVersion = strictNullableDimension(row.model_version);
  const recommendationPolicyVersion = strictNullableDimension(row.recommendation_policy_version);
  if (sector === undefined || analysisArchetype === undefined || modelVersion === undefined || recommendationPolicyVersion === undefined) return null;
  const scope = row.scope as RecommendationPerformanceRollupScopeV3;
  if (!dimensionsMatchScope(scope, sector, analysisArchetype, modelVersion, recommendationPolicyVersion)) return null;

  const sampleCount = strictNonNegativeInteger(row.sample_count);
  const benchmarkCount = strictNonNegativeInteger(row.benchmark_count);
  const directionalCount = strictNonNegativeInteger(row.directional_count);
  if (sampleCount === null || benchmarkCount === null || directionalCount === null) return null;
  if (benchmarkCount > sampleCount || directionalCount > benchmarkCount) return null;

  const hitRate = strictNullableFiniteNumber(row.hit_rate);
  const meanSecurityReturn = strictNullableFiniteNumber(row.mean_security_return);
  const meanExcessReturn = strictNullableFiniteNumber(row.mean_excess_return);
  const medianExcessReturn = strictNullableFiniteNumber(row.median_excess_return);
  if (hitRate === undefined || meanSecurityReturn === undefined || meanExcessReturn === undefined || medianExcessReturn === undefined) return null;
  if (hitRate !== null && (hitRate < 0 || hitRate > 1)) return null;

  return {
    scope,
    horizon: row.horizon as RecommendationOutcomeHorizonV3,
    rating: row.rating as RecommendationV3Rating,
    sector,
    analysisArchetype,
    modelVersion,
    recommendationPolicyVersion,
    sampleCount,
    benchmarkCount,
    directionalCount,
    hitRate,
    meanSecurityReturn,
    meanExcessReturn,
    medianExcessReturn,
    evaluatedAt: row.evaluated_at,
  };
}

/**
 * Reads one complete private materialized performance snapshot. The database RPC
 * locks the exact lineage watermark while collecting rows so a concurrent writer
 * cannot replace the snapshot between the watermark read and row read.
 */
export async function readRecommendationPerformanceRollupSnapshotV3(options: {
  sourceLimit?: number;
  dimensionSampleGate?: number;
} = {}): Promise<RecommendationPerformanceRollupReadResultV3> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, configured: false, snapshot: null, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };
  }

  const sourceLimit = normalizedSourceLimit(options.sourceLimit ?? 5_000);
  const dimensionSampleGate = normalizedDimensionSampleGate(options.dimensionSampleGate ?? 30);

  try {
    const { data, error } = await supabase.rpc("read_recommendation_v3_performance_rollup_snapshot", {
      p_outcome_policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
      p_benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
      p_source_limit: sourceLimit,
      p_dimension_sample_gate: dimensionSampleGate,
    });
    if (error) return { ok: false, configured: true, snapshot: null, error: error.message };

    const payload = persistenceRecord(data);
    if (!payload
        || payload.outcome_policy_version !== RECOMMENDATION_OUTCOME_POLICY_VERSION
        || payload.benchmark_policy_version !== RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3
        || payload.source_limit !== sourceLimit
        || payload.dimension_sample_gate !== dimensionSampleGate
        || !Array.isArray(payload.rollups)) {
      return { ok: false, configured: true, snapshot: null, error: "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT" };
    }

    if (payload.snapshot_evaluated_at === null) {
      if (payload.rollups.length !== 0) {
        return { ok: false, configured: true, snapshot: null, error: "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT" };
      }
      return { ok: true, configured: true, snapshot: null };
    }
    if (!validTimestamp(payload.snapshot_evaluated_at)) {
      return { ok: false, configured: true, snapshot: null, error: "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT" };
    }

    const lineage = {
      evaluatedAt: payload.snapshot_evaluated_at,
      sourceLimit,
      dimensionSampleGate,
    };
    const rollups = payload.rollups.map((value) => parseRecommendationPerformanceRollupReadRowV3(value, lineage));
    if (rollups.some((rollup) => rollup === null)) {
      return { ok: false, configured: true, snapshot: null, error: "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT" };
    }

    return {
      ok: true,
      configured: true,
      snapshot: {
        evaluatedAt: payload.snapshot_evaluated_at,
        outcomePolicyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
        benchmarkPolicyVersion: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
        sourceLimit,
        dimensionSampleGate,
        rollups: rollups as RecommendationPerformanceRollupReadRowV3[],
      },
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      snapshot: null,
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_PERFORMANCE_ROLLUP_READ_ERROR",
    };
  }
}
