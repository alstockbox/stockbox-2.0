import { describe, expect, it, vi } from "vitest";
import type { RecommendationV3ShadowEvent } from "@/lib/analysis/recommendation-v3-shadow";
import type { ClaimedRecommendationReviewRequestV3 } from "@/lib/db/recommendation-review-requests-v3";
import {
  recommendationReviewWorkerGateV3,
  runRecommendationReviewWorkerV3,
} from "@/lib/monitoring/recommendation-review-worker-v3";

function claimed(attempts = 1): ClaimedRecommendationReviewRequestV3 {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    requestId: "request-1",
    dedupeKey: "review:MSFT:news:1",
    policyVersion: "stockbox-recommendation-review-v3.0.0",
    ticker: "MSFT",
    requestedAt: "2026-09-09T10:00:00.000Z",
    trigger: "MATERIAL_NEWS",
    priority: "urgent",
    requestedAction: "RECOMPUTE_OBJECTIVE_RECOMMENDATION",
    sourceId: "news-1",
    sourceObservedAt: "2026-09-09T10:00:00.000Z",
    materiality: 92,
    evidenceIds: ["news-1"],
    reasonCodes: ["MATERIAL_NEWS_REQUIRES_RECOMMENDATION_REVIEW"],
    attempts,
    claimedAt: "2026-09-09T10:01:00.000Z",
  };
}

const event = {} as RecommendationV3ShadowEvent;

function dependencies(request = claimed()) {
  return {
    claimRequests: vi.fn().mockResolvedValue([request]),
    reanalyzeObjective: vi.fn().mockResolvedValue({ status: "ready" as const, event }),
    persistAudit: vi.fn().mockResolvedValue({ ok: true as const, configured: true as const }),
    completeRequest: vi.fn().mockResolvedValue(undefined),
    retryRequest: vi.fn().mockResolvedValue(undefined),
    failRequest: vi.fn().mockResolvedValue(undefined),
  };
}

const gateOverrides = {
  recommendationEnabled: true,
  recommendationKilled: false,
  backgroundJobsKilled: false,
};

describe("Recommendation review worker V3", () => {
  it("requires the feature and both kill switches to permit background work", () => {
    expect(recommendationReviewWorkerGateV3(gateOverrides)).toEqual({ allowed: true });
    expect(recommendationReviewWorkerGateV3({ ...gateOverrides, recommendationEnabled: false }))
      .toEqual({ allowed: false, reason: "recommendation_v3_disabled" });
    expect(recommendationReviewWorkerGateV3({ ...gateOverrides, recommendationKilled: true }))
      .toEqual({ allowed: false, reason: "recommendation_engine_killed" });
    expect(recommendationReviewWorkerGateV3({ ...gateOverrides, backgroundJobsKilled: true }))
      .toEqual({ allowed: false, reason: "background_jobs_killed" });
  });

  it("completes only after objective reanalysis and durable audit persistence", async () => {
    const deps = dependencies();
    const result = await runRecommendationReviewWorkerV3({
      now: new Date("2026-09-09T10:02:00.000Z"),
      gateOverrides,
      dependencies: deps,
    });

    expect(deps.reanalyzeObjective).toHaveBeenCalledWith(expect.objectContaining({ ticker: "MSFT" }));
    expect(deps.persistAudit).toHaveBeenCalledWith(event);
    expect(deps.completeRequest).toHaveBeenCalledOnce();
    expect(deps.retryRequest).not.toHaveBeenCalled();
    expect(deps.failRequest).not.toHaveBeenCalled();
    expect(result).toEqual({ claimed: 1, completed: 1, retried: 0, failed: 0 });
  });

  it("retries transient reanalysis failures with backoff and never completes them", async () => {
    const deps = dependencies();
    deps.reanalyzeObjective.mockResolvedValue({ status: "retryable_failure", error: "provider unavailable" });
    const now = new Date("2026-09-09T10:02:00.000Z");
    const result = await runRecommendationReviewWorkerV3({ now, gateOverrides, dependencies: deps });

    expect(deps.persistAudit).not.toHaveBeenCalled();
    expect(deps.completeRequest).not.toHaveBeenCalled();
    expect(deps.retryRequest).toHaveBeenCalledWith(
      claimed().id,
      "provider unavailable",
      new Date("2026-09-09T10:07:00.000Z"),
      now,
    );
    expect(result).toEqual({ claimed: 1, completed: 0, retried: 1, failed: 0 });
  });

  it("fails closed immediately for permanently invalid work", async () => {
    const deps = dependencies();
    deps.reanalyzeObjective.mockResolvedValue({ status: "permanent_failure", error: "identity mismatch" });
    const result = await runRecommendationReviewWorkerV3({ gateOverrides, dependencies: deps });

    expect(deps.failRequest).toHaveBeenCalledWith(claimed().id, "identity mismatch", expect.any(Date));
    expect(deps.retryRequest).not.toHaveBeenCalled();
    expect(deps.completeRequest).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it("does not mark a request complete when audit persistence is unavailable", async () => {
    const deps = dependencies();
    deps.persistAudit.mockResolvedValue({ ok: false, configured: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" });
    const result = await runRecommendationReviewWorkerV3({ gateOverrides, dependencies: deps });

    expect(deps.completeRequest).not.toHaveBeenCalled();
    expect(deps.retryRequest).toHaveBeenCalledOnce();
    expect(result).toEqual({ claimed: 1, completed: 0, retried: 1, failed: 0 });
  });

  it("moves exhausted retryable work to FAILED", async () => {
    const request = claimed(4);
    const deps = dependencies(request);
    deps.reanalyzeObjective.mockResolvedValue({ status: "retryable_failure", error: "still unavailable" });
    const result = await runRecommendationReviewWorkerV3({
      maxAttempts: 4,
      gateOverrides,
      dependencies: deps,
    });

    expect(deps.failRequest).toHaveBeenCalledWith(request.id, "still unavailable", expect.any(Date));
    expect(deps.retryRequest).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });
});
