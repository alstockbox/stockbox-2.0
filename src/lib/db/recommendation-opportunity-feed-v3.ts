import {
  buildRecommendationOpportunityFeedV3,
  type RecommendationOpportunityAuditV3,
  type RecommendationOpportunityFeedV3,
} from "@/lib/analysis/recommendation-opportunity-feed-v3";
import type { RecommendationV3Rating } from "@/lib/analysis/recommendation-v3";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";

const RATINGS = new Set<RecommendationV3Rating>([
  "STRONG_BUY",
  "BUY",
  "WAIT",
  "HOLD",
  "REDUCE",
  "SELL",
  "UNAVAILABLE",
]);

const FEED_PROJECTION = [
  "id",
  "observed_at",
  "ticker",
  "analysis_archetype",
  "model_version",
  "recommendation_policy_version",
  "v3_rating",
  "objective_score",
  "conviction",
  "data_quality",
  "model_uncertainty",
  "reason_codes",
  "verified_coverage",
  "recommendation_eligible",
  "recommendation_integrity_eligible",
  "confidence_gate_passed",
  "confidence_gate_hard_blocked",
  "data_integrity_score",
].join(",");

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function recommendationOpportunityAuditFromRowV3(value: unknown): RecommendationOpportunityAuditV3 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string"
      || typeof row.observed_at !== "string"
      || !Number.isFinite(Date.parse(row.observed_at))
      || typeof row.ticker !== "string"
      || typeof row.analysis_archetype !== "string"
      || typeof row.model_version !== "string"
      || typeof row.recommendation_policy_version !== "string") return null;
  if (typeof row.v3_rating !== "string" || !RATINGS.has(row.v3_rating as RecommendationV3Rating)) return null;

  const objectiveScore = finiteNumber(row.objective_score);
  const conviction = finiteNumber(row.conviction);
  const dataQuality = finiteNumber(row.data_quality);
  const modelUncertainty = finiteNumber(row.model_uncertainty);
  const verifiedCoverage = finiteNumber(row.verified_coverage);
  const dataIntegrityScore = finiteNumber(row.data_integrity_score);
  const recommendationEligible = booleanValue(row.recommendation_eligible);
  const recommendationIntegrityEligible = booleanValue(row.recommendation_integrity_eligible);
  const confidenceGatePassed = booleanValue(row.confidence_gate_passed);
  const confidenceGateHardBlocked = booleanValue(row.confidence_gate_hard_blocked);

  if (conviction === null || dataQuality === null || modelUncertainty === null
      || verifiedCoverage === null || dataIntegrityScore === null
      || recommendationEligible === null || recommendationIntegrityEligible === null
      || confidenceGatePassed === null || confidenceGateHardBlocked === null) return null;

  return {
    id: row.id,
    observedAt: row.observed_at,
    ticker: row.ticker.trim().toUpperCase(),
    analysisArchetype: row.analysis_archetype,
    modelVersion: row.model_version,
    recommendationPolicyVersion: row.recommendation_policy_version,
    rating: row.v3_rating as RecommendationV3Rating,
    objectiveScore,
    conviction,
    dataQuality,
    modelUncertainty,
    reasonCodes: Array.isArray(row.reason_codes)
      ? row.reason_codes.filter((reason): reason is string => typeof reason === "string")
      : [],
    verifiedCoverage,
    recommendationEligible,
    recommendationIntegrityEligible,
    confidenceGatePassed,
    confidenceGateHardBlocked,
    dataIntegrityScore,
  };
}

export type RecommendationOpportunityFeedLoadResultV3 =
  | { status: "disabled" }
  | { status: "killed" }
  | { status: "unconfigured" }
  | { status: "failed"; error: string }
  | { status: "ready"; feed: RecommendationOpportunityFeedV3; sourceRows: number; usableRows: number };

export async function loadRecommendationOpportunityFeedV3(options: {
  rowLimit?: number;
  sinceDays?: number;
  sectionLimit?: number;
  topLimit?: number;
  whatChangedLimit?: number;
} = {}): Promise<RecommendationOpportunityFeedLoadResultV3> {
  if (!isFeatureEnabled("recommendationV3")) return { status: "disabled" };
  if (isKilled("recommendationEngine")) return { status: "killed" };
  const admin = createAdminClient();
  if (!admin) return { status: "unconfigured" };

  const rowLimit = Math.max(100, Math.min(options.rowLimit ?? 5_000, 20_000));
  const sinceDays = Math.max(1, Math.min(options.sinceDays ?? 30, 365));
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  try {
    const { data, error } = await admin
      .from("analysis_recommendation_v3_audit")
      .select(FEED_PROJECTION)
      .gte("observed_at", since)
      .order("observed_at", { ascending: false })
      .limit(rowLimit);
    if (error) return { status: "failed", error: error.message };

    const rows = data ?? [];
    const snapshots = rows.flatMap((value) => {
      const parsed = recommendationOpportunityAuditFromRowV3(value);
      return parsed ? [parsed] : [];
    });
    return {
      status: "ready",
      feed: buildRecommendationOpportunityFeedV3(snapshots, {
        sectionLimit: options.sectionLimit,
        topLimit: options.topLimit,
        whatChangedLimit: options.whatChangedLimit,
      }),
      sourceRows: rows.length,
      usableRows: snapshots.length,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_FEED_ERROR",
    };
  }
}
