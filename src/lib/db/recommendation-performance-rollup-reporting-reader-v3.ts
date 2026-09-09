import {
  readRecommendationPerformanceRollupSnapshotV3,
  type RecommendationPerformanceRollupReadResultV3,
  type RecommendationPerformanceRollupReadRowV3,
  type RecommendationPerformanceRollupSnapshotV3,
} from "@/lib/db/recommendation-performance-rollups-v3";

export const RECOMMENDATION_PERFORMANCE_ROLLUP_STALE_ERROR_V3 =
  "STALE_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT" as const;
export const RECOMMENDATION_PERFORMANCE_ROLLUP_INVALID_FRESHNESS_POLICY_ERROR_V3 =
  "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_FRESHNESS_POLICY" as const;
export const RECOMMENDATION_PERFORMANCE_ROLLUP_INVALID_SNAPSHOT_ERROR_V3 =
  "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT" as const;

export type RecommendationPerformanceRollupReportingReadOptionsV3 = {
  sourceLimit?: number;
  dimensionSampleGate?: number;
  /**
   * Freshness is deliberately consumer-owned. There is no global reporting
   * cadence hidden in this reader; every caller must state how old a snapshot
   * may be for its own use case.
   */
  maxAgeMs: number;
  /** Deterministic evaluation seam for jobs/tests. Defaults to the current clock. */
  now?: string;
};

export type RecommendationPerformanceRollupSnapshotValidationV3 =
  | { ok: true }
  | {
      ok: false;
      error:
        | typeof RECOMMENDATION_PERFORMANCE_ROLLUP_STALE_ERROR_V3
        | typeof RECOMMENDATION_PERFORMANCE_ROLLUP_INVALID_FRESHNESS_POLICY_ERROR_V3
        | typeof RECOMMENDATION_PERFORMANCE_ROLLUP_INVALID_SNAPSHOT_ERROR_V3;
    };

function validTimestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function logicalRollupIdentity(row: RecommendationPerformanceRollupReadRowV3): string {
  return JSON.stringify([
    row.scope,
    row.horizon,
    row.rating,
    row.sector,
    row.analysisArchetype,
    row.modelVersion,
    row.recommendationPolicyVersion,
  ]);
}

/**
 * Adds reporting-consumer guardrails on top of the atomic database snapshot.
 * The low-level reader remains cadence-neutral while this contract rejects
 * duplicate logical rows and snapshots older than the caller explicitly allows.
 */
export function validateRecommendationPerformanceRollupSnapshotForReportingV3(
  snapshot: RecommendationPerformanceRollupSnapshotV3,
  options: Pick<RecommendationPerformanceRollupReportingReadOptionsV3, "maxAgeMs" | "now">,
): RecommendationPerformanceRollupSnapshotValidationV3 {
  if (!Number.isFinite(options.maxAgeMs) || options.maxAgeMs < 0) {
    return { ok: false, error: RECOMMENDATION_PERFORMANCE_ROLLUP_INVALID_FRESHNESS_POLICY_ERROR_V3 };
  }

  const nowMs = validTimestampMs(options.now ?? new Date().toISOString());
  const evaluatedAtMs = validTimestampMs(snapshot.evaluatedAt);
  if (nowMs === null || evaluatedAtMs === null) {
    return { ok: false, error: RECOMMENDATION_PERFORMANCE_ROLLUP_INVALID_FRESHNESS_POLICY_ERROR_V3 };
  }

  const identities = new Set<string>();
  for (const rollup of snapshot.rollups) {
    const identity = logicalRollupIdentity(rollup);
    if (identities.has(identity)) {
      return { ok: false, error: RECOMMENDATION_PERFORMANCE_ROLLUP_INVALID_SNAPSHOT_ERROR_V3 };
    }
    identities.add(identity);
  }

  if (nowMs - evaluatedAtMs > options.maxAgeMs) {
    return { ok: false, error: RECOMMENDATION_PERFORMANCE_ROLLUP_STALE_ERROR_V3 };
  }

  return { ok: true };
}

/**
 * Reporting-safe read facade. Atomic lineage validation is delegated to the
 * durable reader; this layer only adds consumer-owned freshness and duplicate
 * identity checks. It never repairs rows or infers missing dimensions/metrics.
 */
export async function readRecommendationPerformanceRollupSnapshotForReportingV3(
  options: RecommendationPerformanceRollupReportingReadOptionsV3,
): Promise<RecommendationPerformanceRollupReadResultV3> {
  const result = await readRecommendationPerformanceRollupSnapshotV3({
    sourceLimit: options.sourceLimit,
    dimensionSampleGate: options.dimensionSampleGate,
  });
  if (!result.ok || result.snapshot === null) return result;

  const validation = validateRecommendationPerformanceRollupSnapshotForReportingV3(
    result.snapshot,
    { maxAgeMs: options.maxAgeMs, now: options.now },
  );
  if (!validation.ok) {
    return {
      ok: false,
      configured: true,
      snapshot: null,
      error: validation.error,
    };
  }

  return result;
}
