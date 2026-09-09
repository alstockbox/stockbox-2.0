import type { RecommendationReviewRequestV3 } from "@/lib/analysis/recommendation-review-request-v3";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";

export type RecommendationReviewRequestRowV3 = {
  request_id: string;
  dedupe_key: string;
  policy_version: string;
  ticker: string;
  requested_at: string;
  trigger: RecommendationReviewRequestV3["trigger"];
  priority: RecommendationReviewRequestV3["priority"];
  requested_action: RecommendationReviewRequestV3["requestedAction"];
  source_id: string;
  source_observed_at: string;
  materiality: number | null;
  evidence_ids: string[];
  reason_codes: string[];
  status: "PENDING";
};

function clean(value: string): string {
  return value.trim();
}

export function toRecommendationReviewRequestRowV3(
  request: RecommendationReviewRequestV3,
): RecommendationReviewRequestRowV3 {
  const normalizedTicker = clean(request.ticker).toUpperCase();
  if (!normalizedTicker) throw new Error("RECOMMENDATION_REVIEW_TICKER_REQUIRED");
  if (request.requestedAction !== "RECOMPUTE_OBJECTIVE_RECOMMENDATION") {
    throw new Error("INVALID_RECOMMENDATION_REVIEW_ACTION");
  }

  return {
    request_id: clean(request.requestId),
    dedupe_key: clean(request.dedupeKey),
    policy_version: clean(request.policyVersion),
    ticker: normalizedTicker,
    requested_at: request.requestedAt,
    trigger: request.trigger,
    priority: request.priority,
    requested_action: request.requestedAction,
    source_id: clean(request.sourceId),
    source_observed_at: request.sourceObservedAt,
    materiality: request.materiality,
    evidence_ids: request.evidenceIds.map(clean).filter(Boolean).slice(0, 100),
    reason_codes: request.reasonCodes.map(clean).filter(Boolean).slice(0, 100),
    status: "PENDING",
  };
}

export type RecommendationReviewPersistResultV3 =
  | { status: "disabled" }
  | { status: "killed" }
  | { status: "unconfigured" }
  | { status: "ready"; created: boolean; id: string | null }
  | { status: "failed"; error: string };

/**
 * Stores an objective review request at-most-once by deterministic dedupe key.
 * It deliberately does not execute analysis and never accepts a target rating.
 */
export async function persistRecommendationReviewRequestV3(
  request: RecommendationReviewRequestV3,
): Promise<RecommendationReviewPersistResultV3> {
  if (!isFeatureEnabled("recommendationV3")) return { status: "disabled" };
  if (isKilled("recommendationEngine")) return { status: "killed" };

  const admin = createAdminClient();
  if (!admin) return { status: "unconfigured" };
  const row = toRecommendationReviewRequestRowV3(request);

  try {
    const { data: existing, error: readError } = await admin
      .from("analysis_recommendation_v3_review_requests")
      .select("id")
      .eq("dedupe_key", row.dedupe_key)
      .maybeSingle();
    if (readError) return { status: "failed", error: readError.message };
    if (existing && typeof existing.id === "string") {
      return { status: "ready", created: false, id: existing.id };
    }

    const { data, error } = await admin
      .from("analysis_recommendation_v3_review_requests")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        const { data: raced, error: racedError } = await admin
          .from("analysis_recommendation_v3_review_requests")
          .select("id")
          .eq("dedupe_key", row.dedupe_key)
          .maybeSingle();
        if (racedError) return { status: "failed", error: racedError.message };
        return {
          status: "ready",
          created: false,
          id: raced && typeof raced.id === "string" ? raced.id : null,
        };
      }
      return { status: "failed", error: error.message };
    }

    return {
      status: "ready",
      created: true,
      id: data && typeof data.id === "string" ? data.id : null,
    };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_REVIEW_PERSISTENCE_ERROR",
    };
  }
}
