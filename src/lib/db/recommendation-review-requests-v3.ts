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

export type ClaimedRecommendationReviewRequestV3 = {
  id: string;
  requestId: string;
  dedupeKey: string;
  policyVersion: string;
  ticker: string;
  requestedAt: string;
  trigger: RecommendationReviewRequestV3["trigger"];
  priority: RecommendationReviewRequestV3["priority"];
  requestedAction: RecommendationReviewRequestV3["requestedAction"];
  sourceId: string;
  sourceObservedAt: string;
  materiality: number | null;
  evidenceIds: string[];
  reasonCodes: string[];
  attempts: number;
  claimedAt: string;
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function claimedRow(value: unknown): ClaimedRecommendationReviewRequestV3 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.ticker !== "string" || typeof row.claimed_at !== "string") return null;
  if (row.requested_action !== "RECOMPUTE_OBJECTIVE_RECOMMENDATION") return null;
  if (row.status !== "PROCESSING") return null;
  if (row.trigger !== "MATERIAL_NEWS" && row.trigger !== "LIFECYCLE_RECONSIDER") return null;
  if (row.priority !== "normal" && row.priority !== "high" && row.priority !== "urgent") return null;
  if (typeof row.attempts !== "number" || !Number.isInteger(row.attempts) || row.attempts < 1) return null;

  return {
    id: row.id,
    requestId: typeof row.request_id === "string" ? row.request_id : "",
    dedupeKey: typeof row.dedupe_key === "string" ? row.dedupe_key : "",
    policyVersion: typeof row.policy_version === "string" ? row.policy_version : "",
    ticker: row.ticker.trim().toUpperCase(),
    requestedAt: typeof row.requested_at === "string" ? row.requested_at : "",
    trigger: row.trigger,
    priority: row.priority,
    requestedAction: row.requested_action,
    sourceId: typeof row.source_id === "string" ? row.source_id : "",
    sourceObservedAt: typeof row.source_observed_at === "string" ? row.source_observed_at : "",
    materiality: typeof row.materiality === "number" && Number.isFinite(row.materiality) ? row.materiality : null,
    evidenceIds: stringArray(row.evidence_ids),
    reasonCodes: stringArray(row.reason_codes),
    attempts: row.attempts,
    claimedAt: row.claimed_at,
  };
}

function adminOrThrow() {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable for recommendation reviews.");
  return admin;
}

export async function claimRecommendationReviewRequestsV3(options: {
  limit?: number;
  now?: Date;
  leaseSeconds?: number;
} = {}): Promise<ClaimedRecommendationReviewRequestV3[]> {
  const admin = adminOrThrow();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 100));
  const leaseSeconds = Math.max(60, Math.min(options.leaseSeconds ?? 900, 86_400));
  const { data, error } = await admin.rpc("claim_recommendation_v3_review_requests", {
    p_limit: limit,
    p_now: (options.now ?? new Date()).toISOString(),
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(`Unable to claim recommendation review requests: ${error.message}`);
  return (Array.isArray(data) ? data : []).flatMap((row) => {
    const parsed = claimedRow(row);
    return parsed ? [parsed] : [];
  });
}

async function transitionRecommendationReviewRequestV3(
  functionName: "complete_recommendation_v3_review_request" | "retry_recommendation_v3_review_request" | "fail_recommendation_v3_review_request",
  args: Record<string, unknown>,
): Promise<void> {
  const admin = adminOrThrow();
  const { data, error } = await admin.rpc(functionName, args);
  if (error) throw new Error(`Recommendation review transition failed: ${error.message}`);
  if (data !== true) throw new Error("Recommendation review transition rejected because the request is no longer PROCESSING.");
}

export async function completeRecommendationReviewRequestV3(id: string, now = new Date()): Promise<void> {
  await transitionRecommendationReviewRequestV3("complete_recommendation_v3_review_request", {
    p_id: id,
    p_now: now.toISOString(),
  });
}

export async function retryRecommendationReviewRequestV3(
  id: string,
  error: string,
  nextAttemptAt: Date,
  now = new Date(),
): Promise<void> {
  await transitionRecommendationReviewRequestV3("retry_recommendation_v3_review_request", {
    p_id: id,
    p_error: error,
    p_next_attempt_at: nextAttemptAt.toISOString(),
    p_now: now.toISOString(),
  });
}

export async function failRecommendationReviewRequestV3(id: string, error: string, now = new Date()): Promise<void> {
  await transitionRecommendationReviewRequestV3("fail_recommendation_v3_review_request", {
    p_id: id,
    p_error: error,
    p_now: now.toISOString(),
  });
}
