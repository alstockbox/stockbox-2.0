import type { RecommendationLifecycleEventV3 } from "./recommendation-lifecycle-v3";
import type { NewsEventV3 } from "@/lib/news/news-intelligence-v3";

export const RECOMMENDATION_REVIEW_POLICY_VERSION = "stockbox-recommendation-review-v3.0.0" as const;

export type RecommendationReviewTriggerV3 = "MATERIAL_NEWS" | "LIFECYCLE_RECONSIDER";
export type RecommendationReviewPriorityV3 = "normal" | "high" | "urgent";

export type RecommendationReviewRequestV3 = {
  policyVersion: typeof RECOMMENDATION_REVIEW_POLICY_VERSION;
  requestId: string;
  dedupeKey: string;
  ticker: string;
  requestedAt: string;
  trigger: RecommendationReviewTriggerV3;
  priority: RecommendationReviewPriorityV3;
  requestedAction: "RECOMPUTE_OBJECTIVE_RECOMMENDATION";
  sourceId: string;
  sourceObservedAt: string;
  materiality: number | null;
  evidenceIds: string[];
  reasonCodes: string[];
};

function ticker(value: string): string {
  return value.trim().toUpperCase();
}

function priorityFromNews(event: NewsEventV3): RecommendationReviewPriorityV3 {
  if (event.materiality >= 85 || ["regulatory", "cybersecurity", "m_and_a"].includes(event.eventType)) return "urgent";
  if (event.materiality >= 75 || event.thesisImpact === "high") return "high";
  return "normal";
}

function priorityFromLifecycle(event: RecommendationLifecycleEventV3): RecommendationReviewPriorityV3 {
  if (event.state === "CLOSED" || event.severity === "important") return "urgent";
  if (event.material || event.severity === "watch") return "high";
  return "normal";
}

/**
 * Material news may request a fresh deterministic recommendation calculation,
 * but it never proposes or mutates a rating itself. The request carries only
 * source evidence and orchestration metadata.
 */
export function buildRecommendationReviewRequestFromNewsV3(
  event: NewsEventV3,
): RecommendationReviewRequestV3 | null {
  if (!event.requiresRecommendationReview) return null;
  const normalizedTicker = ticker(event.ticker);
  if (!normalizedTicker) return null;
  const dedupeKey = `${RECOMMENDATION_REVIEW_POLICY_VERSION}:${normalizedTicker}:news:${event.dedupeKey}`;

  return {
    policyVersion: RECOMMENDATION_REVIEW_POLICY_VERSION,
    requestId: dedupeKey,
    dedupeKey,
    ticker: normalizedTicker,
    requestedAt: event.publishedAt,
    trigger: "MATERIAL_NEWS",
    priority: priorityFromNews(event),
    requestedAction: "RECOMPUTE_OBJECTIVE_RECOMMENDATION",
    sourceId: event.id,
    sourceObservedAt: event.publishedAt,
    materiality: event.materiality,
    evidenceIds: [event.id],
    reasonCodes: [
      "MATERIAL_NEWS_REQUIRES_RECOMMENDATION_REVIEW",
      `NEWS_EVENT_${event.eventType.toUpperCase()}`,
      `NEWS_DIRECTION_${event.direction.toUpperCase()}`,
    ],
  };
}

/**
 * Lifecycle deterioration can ask the analysis pipeline to reconsider current
 * evidence. This does not create a replacement recommendation and therefore
 * cannot form a feedback loop that silently promotes/demotes a security.
 */
export function buildRecommendationReviewRequestFromLifecycleV3(
  event: RecommendationLifecycleEventV3,
): RecommendationReviewRequestV3 | null {
  if (!event.reconsider) return null;
  const normalizedTicker = ticker(event.ticker);
  if (!normalizedTicker) return null;
  const dedupeKey = [
    RECOMMENDATION_REVIEW_POLICY_VERSION,
    normalizedTicker,
    "lifecycle",
    event.currentSnapshotId,
    event.state,
  ].join(":");

  return {
    policyVersion: RECOMMENDATION_REVIEW_POLICY_VERSION,
    requestId: dedupeKey,
    dedupeKey,
    ticker: normalizedTicker,
    requestedAt: event.observedAt,
    trigger: "LIFECYCLE_RECONSIDER",
    priority: priorityFromLifecycle(event),
    requestedAction: "RECOMPUTE_OBJECTIVE_RECOMMENDATION",
    sourceId: event.currentSnapshotId,
    sourceObservedAt: event.observedAt,
    materiality: null,
    evidenceIds: [event.currentSnapshotId],
    reasonCodes: ["OBJECTIVE_RECOMMENDATION_RECONSIDER", ...event.reasonCodes],
  };
}
