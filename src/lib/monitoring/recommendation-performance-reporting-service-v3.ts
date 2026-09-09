import {
  selectRecommendationPerformanceRollupV3,
  type RecommendationPerformanceReportLineageV3,
  type RecommendationPerformanceReportQueryV3,
} from "@/lib/analysis/recommendation-performance-reporting-v3";
import type { RecommendationPerformanceRollupReadRowV3 } from "@/lib/db/recommendation-performance-rollups-v3";
import {
  readRecommendationPerformanceRollupSnapshotForReportingV3,
  type RecommendationPerformanceRollupReportingReadOptionsV3,
} from "@/lib/db/recommendation-performance-rollup-reporting-reader-v3";

export type RecommendationPerformanceReportReadResultV3 =
  | {
      ok: true;
      configured: true;
      lineage: RecommendationPerformanceReportLineageV3;
      rollup: RecommendationPerformanceRollupReadRowV3;
    }
  | {
      ok: false;
      configured: false;
      reason: "NOT_CONFIGURED";
      error: "SUPABASE_ADMIN_NOT_CONFIGURED";
    }
  | {
      ok: false;
      configured: true;
      reason: "SNAPSHOT_UNAVAILABLE" | "INVALID_QUERY" | "NOT_FOUND";
    }
  | {
      ok: false;
      configured: true;
      reason: "SNAPSHOT_READ_FAILED";
      error: string;
    };

/**
 * Internal read service for Recommendation V3 performance reporting.
 *
 * This composes the durable atomic snapshot reader, consumer-owned freshness
 * guardrails and exact slice selection into one fail-closed contract. It is not
 * an API route and it deliberately does not participate in calibration or
 * recommendation serving. Missing specialist/dimensional evidence never falls
 * back to BASE and missing metrics remain null.
 */
export async function readRecommendationPerformanceReportV3(
  query: RecommendationPerformanceReportQueryV3,
  options: RecommendationPerformanceRollupReportingReadOptionsV3,
): Promise<RecommendationPerformanceReportReadResultV3> {
  const snapshotResult = await readRecommendationPerformanceRollupSnapshotForReportingV3(options);

  if (!snapshotResult.ok) {
    if (!snapshotResult.configured) {
      return {
        ok: false,
        configured: false,
        reason: "NOT_CONFIGURED",
        error: "SUPABASE_ADMIN_NOT_CONFIGURED",
      };
    }

    return {
      ok: false,
      configured: true,
      reason: "SNAPSHOT_READ_FAILED",
      error: snapshotResult.error,
    };
  }

  if (snapshotResult.snapshot === null) {
    return { ok: false, configured: true, reason: "SNAPSHOT_UNAVAILABLE" };
  }

  const selection = selectRecommendationPerformanceRollupV3(snapshotResult.snapshot, query);
  if (!selection.ok) {
    return {
      ok: false,
      configured: true,
      reason: selection.reason,
    };
  }

  return {
    ok: true,
    configured: true,
    lineage: selection.lineage,
    rollup: selection.rollup,
  };
}
