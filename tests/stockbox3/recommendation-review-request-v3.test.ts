import { describe, expect, it } from "vitest";
import { deriveNewsEventV3 } from "@/lib/news/news-intelligence-v3";
import {
  buildRecommendationReviewRequestFromNewsV3,
  buildRecommendationReviewRequestFromLifecycleV3,
} from "@/lib/analysis/recommendation-review-request-v3";
import { deriveRecommendationLifecycleV3 } from "@/lib/analysis/recommendation-lifecycle-v3";

const news = (title: string) => deriveNewsEventV3({
  id: "news-1",
  ticker: "msft",
  title,
  summary: "Full-year material update.",
  publishedAt: "2026-09-09T10:00:00.000Z",
  source: "test-wire",
  url: "https://example.test/news-1",
});

describe("Recommendation review requests V3", () => {
  it("turns material news into a deterministic objective re-analysis request", () => {
    const event = news("Microsoft cuts full-year guidance after earnings miss");
    const request = buildRecommendationReviewRequestFromNewsV3(event);

    expect(request).not.toBeNull();
    expect(request?.ticker).toBe("MSFT");
    expect(request?.trigger).toBe("MATERIAL_NEWS");
    expect(request?.requestedAction).toBe("RECOMPUTE_OBJECTIVE_RECOMMENDATION");
    expect(request?.evidenceIds).toEqual(["news-1"]);
    expect(request?.priority).toBe("urgent");
    expect(request?.dedupeKey).toContain(event.dedupeKey);
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("targetRating");
    expect(serialized).not.toContain("proposedRating");
    expect(serialized).not.toContain("personalized");
  });

  it("does not create a review request for low-materiality routine news", () => {
    expect(buildRecommendationReviewRequestFromNewsV3(news("Routine minor product refresh"))).toBeNull();
  });

  it("creates a high-priority lifecycle review only when the objective engine says reconsider", () => {
    const previous = {
      snapshotId: "before",
      ticker: "MSFT",
      observedAt: "2026-09-08T10:00:00.000Z",
      rating: "BUY" as const,
      objectiveScore: 80,
      conviction: 88,
      dataQuality: 90,
      modelUncertainty: 15,
    };
    const current = {
      ...previous,
      snapshotId: "after",
      observedAt: "2026-09-09T10:00:00.000Z",
      objectiveScore: 70,
      conviction: 75,
    };
    const lifecycle = deriveRecommendationLifecycleV3(previous, current);
    const request = buildRecommendationReviewRequestFromLifecycleV3(lifecycle);

    expect(lifecycle.state).toBe("WEAKENED");
    expect(lifecycle.severity).toBe("watch");
    expect(request?.trigger).toBe("LIFECYCLE_RECONSIDER");
    expect(request?.priority).toBe("high");
    expect(request?.sourceId).toBe("after");

    const stable = deriveRecommendationLifecycleV3(current, {
      ...current,
      snapshotId: "stable",
      observedAt: "2026-09-10T10:00:00.000Z",
      objectiveScore: 71,
      conviction: 77,
    });
    expect(buildRecommendationReviewRequestFromLifecycleV3(stable)).toBeNull();
  });

  it("escalates important lifecycle deterioration to urgent", () => {
    const lifecycle = deriveRecommendationLifecycleV3(
      {
        snapshotId: "before",
        ticker: "MSFT",
        observedAt: "2026-09-08T10:00:00.000Z",
        rating: "BUY",
        objectiveScore: 85,
        conviction: 90,
        dataQuality: 92,
        modelUncertainty: 10,
      },
      {
        snapshotId: "after",
        ticker: "MSFT",
        observedAt: "2026-09-09T10:00:00.000Z",
        rating: "BUY",
        objectiveScore: 68,
        conviction: 65,
        dataQuality: 90,
        modelUncertainty: 12,
      },
    );

    expect(lifecycle.severity).toBe("important");
    expect(buildRecommendationReviewRequestFromLifecycleV3(lifecycle)?.priority).toBe("urgent");
  });
});
