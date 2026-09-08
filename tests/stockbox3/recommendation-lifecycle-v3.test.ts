import { describe, expect, it } from "vitest";
import {
  deriveRecommendationLifecycleV3,
  type RecommendationLifecycleSnapshotV3,
} from "@/lib/analysis/recommendation-lifecycle-v3";

function snapshot(overrides: Partial<RecommendationLifecycleSnapshotV3> = {}): RecommendationLifecycleSnapshotV3 {
  return {
    snapshotId: "snapshot-current",
    ticker: "MSFT",
    observedAt: "2026-09-09T08:00:00.000Z",
    rating: "BUY",
    objectiveScore: 76,
    conviction: 82,
    dataQuality: 90,
    modelUncertainty: 18,
    ...overrides,
  };
}

describe("Recommendation lifecycle V3", () => {
  it("marks the first available objective recommendation as NEW", () => {
    const event = deriveRecommendationLifecycleV3(null, snapshot());
    expect(event.state).toBe("NEW");
    expect(event.material).toBe(true);
    expect(event.direction).toBe("neutral");
  });

  it("distinguishes upgrades and downgrades by recommendation rank", () => {
    const upgraded = deriveRecommendationLifecycleV3(
      snapshot({ snapshotId: "previous", rating: "HOLD", observedAt: "2026-09-08T08:00:00.000Z" }),
      snapshot({ rating: "BUY" }),
    );
    const downgraded = deriveRecommendationLifecycleV3(
      snapshot({ snapshotId: "previous", rating: "STRONG_BUY", observedAt: "2026-09-08T08:00:00.000Z" }),
      snapshot({ rating: "HOLD" }),
    );

    expect(upgraded.state).toBe("UPGRADED");
    expect(upgraded.direction).toBe("supports");
    expect(downgraded.state).toBe("DOWNGRADED");
    expect(downgraded.direction).toBe("weakens");
    expect(downgraded.reconsider).toBe(true);
  });

  it("marks same-rating material evidence improvement as STRENGTHENED", () => {
    const event = deriveRecommendationLifecycleV3(
      snapshot({ snapshotId: "previous", observedAt: "2026-09-08T08:00:00.000Z", objectiveScore: 70, conviction: 70 }),
      snapshot({ objectiveScore: 78, conviction: 83 }),
    );

    expect(event.state).toBe("STRENGTHENED");
    expect(event.direction).toBe("supports");
    expect(event.scoreDelta).toBe(8);
    expect(event.convictionDelta).toBe(13);
  });

  it("marks same-rating material deterioration as WEAKENED", () => {
    const event = deriveRecommendationLifecycleV3(
      snapshot({ snapshotId: "previous", observedAt: "2026-09-08T08:00:00.000Z", objectiveScore: 80, conviction: 88 }),
      snapshot({ objectiveScore: 73, conviction: 73 }),
    );

    expect(event.state).toBe("WEAKENED");
    expect(event.direction).toBe("weakens");
    expect(event.reconsider).toBe(true);
  });

  it("closes an active recommendation when verified recommendation output becomes unavailable", () => {
    const event = deriveRecommendationLifecycleV3(
      snapshot({ snapshotId: "previous", observedAt: "2026-09-08T08:00:00.000Z", rating: "BUY" }),
      snapshot({ rating: "UNAVAILABLE", objectiveScore: null, conviction: 0, dataQuality: 30 }),
    );

    expect(event.state).toBe("CLOSED");
    expect(event.severity).toBe("important");
    expect(event.reconsider).toBe(true);
  });

  it("keeps immaterial same-rating drift ACTIVE and non-material", () => {
    const event = deriveRecommendationLifecycleV3(
      snapshot({ snapshotId: "previous", observedAt: "2026-09-08T08:00:00.000Z", objectiveScore: 76, conviction: 82 }),
      snapshot({ objectiveScore: 78, conviction: 85 }),
    );

    expect(event.state).toBe("ACTIVE");
    expect(event.material).toBe(false);
    expect(event.reconsider).toBe(false);
  });

  it("fails closed across ticker mismatches instead of comparing unrelated securities", () => {
    expect(() => deriveRecommendationLifecycleV3(
      snapshot({ snapshotId: "previous", ticker: "AAPL" }),
      snapshot({ ticker: "MSFT" }),
    )).toThrow("RECOMMENDATION_LIFECYCLE_TICKER_MISMATCH");
  });
});
