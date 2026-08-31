import { describe, expect, it } from "vitest";
import {
  analyticsDistinctId,
  sanitizeAnalyticsProperties,
} from "../../src/lib/analytics/events";

describe("analytics privacy boundary", () => {
  it("pseudonymizes StockBox user IDs before third-party analytics", () => {
    const rawUserId = "6b88bc78-1d27-4dd3-962b-7e03451350cb";
    const distinctId = analyticsDistinctId(rawUserId);
    expect(distinctId).not.toBe(rawUserId);
    expect(distinctId).toMatch(/^sb_[a-f0-9]{64}$/);
    expect(analyticsDistinctId(rawUserId)).toBe(distinctId);
  });

  it("keeps only event-specific non-sensitive properties", () => {
    const safe = sanitizeAnalyticsProperties("analysis_completed", {
      userId: "raw-user", analysisId: "raw-analysis", subscriptionId: "sub_raw",
      ticker: "AAPL", score: 81, researchView: "Strong", recommendation: "Buy", email: "person@example.com",
    });
    expect(safe).toEqual({ ticker: "AAPL", score: 81, researchView: "Strong" });
  });
});
