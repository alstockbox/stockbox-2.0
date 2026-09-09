import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RecommendationReviewRequestV3 } from "@/lib/analysis/recommendation-review-request-v3";
import { toRecommendationReviewRequestRowV3 } from "@/lib/db/recommendation-review-requests-v3";

function request(): RecommendationReviewRequestV3 {
  return {
    policyVersion: "stockbox-recommendation-review-v3.0.0",
    requestId: "request-1",
    dedupeKey: "review:MSFT:news:1",
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
  };
}

const queueMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260909105000_recommendation_v3_review_requests.sql"),
  "utf8",
);
const workerMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260909110000_recommendation_v3_review_worker.sql"),
  "utf8",
);

describe("Recommendation review request V3 persistence", () => {
  it("maps only objective orchestration metadata", () => {
    const row = toRecommendationReviewRequestRowV3(request());
    const serialized = JSON.stringify(row);

    expect(row.ticker).toBe("MSFT");
    expect(row.status).toBe("PENDING");
    expect(row.requested_action).toBe("RECOMPUTE_OBJECTIVE_RECOMMENDATION");
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("portfolio");
    expect(serialized).not.toContain("personalized");
    expect(serialized).not.toContain("target_rating");
  });

  it("keeps the queue private, deduplicated and constrained to objective recomputation", () => {
    expect(queueMigration).toContain("dedupe_key text not null unique");
    expect(queueMigration).toContain("requested_action = 'RECOMPUTE_OBJECTIVE_RECOMMENDATION'");
    expect(queueMigration).toContain("enable row level security");
    expect(queueMigration).toContain("from authenticated");
    expect(queueMigration).toContain("to service_role");
    expect(queueMigration).toContain("status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')");
  });

  it("claims due work atomically with lease recovery and service-role-only RPCs", () => {
    expect(workerMigration).toContain("next_attempt_at timestamptz");
    expect(workerMigration).toContain("for update skip locked");
    expect(workerMigration).toContain("PROCESSING_LEASE_EXPIRED_RECLAIMED");
    expect(workerMigration).toContain("attempts = request.attempts + 1");
    expect(workerMigration).toContain("claim_recommendation_v3_review_requests");
    expect(workerMigration).toContain("retry_recommendation_v3_review_request");
    expect(workerMigration).toContain("fail_recommendation_v3_review_request");
    expect(workerMigration).toContain("from public, anon, authenticated");
    expect(workerMigration).toContain("to service_role");
    expect(workerMigration).not.toContain("target_rating");
    expect(workerMigration).not.toContain("user_id");
  });
});
