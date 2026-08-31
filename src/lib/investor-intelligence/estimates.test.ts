import { describe, expect, it } from "vitest";
import { buildEstimateRevisionSummary } from "./estimates";

describe("buildEstimateRevisionSummary", () => {
  it("calculates revisions from real snapshots and classifies momentum transparently", () => {
    const now = new Date("2026-08-31T12:00:00Z");
    const result = buildEstimateRevisionSummary([
      { capturedAt: "2026-06-01T12:00:00Z", revenueConsensus: 100, epsConsensus: 10, targetPrice: 120, analystCount: 20, highEstimate: 14, lowEstimate: 8 },
      { capturedAt: "2026-08-01T12:00:00Z", revenueConsensus: 105, epsConsensus: 11, targetPrice: 125, analystCount: 21, highEstimate: 15, lowEstimate: 9 },
      { capturedAt: "2026-08-31T12:00:00Z", revenueConsensus: 110, epsConsensus: 12, targetPrice: 130, analystCount: 22, highEstimate: 16, lowEstimate: 10 },
    ], now);
    expect(result.eps.days90?.change).toBeCloseTo(0.2);
    expect(result.revenue.days30?.change).toBeCloseTo(110 / 105 - 1);
    expect(["Positive", "Strong Positive"]).toContain(result.momentum.label);
  });

  it("does not infer revisions without comparable snapshots", () => {
    const result = buildEstimateRevisionSummary([{ capturedAt: "2026-08-31T12:00:00Z", revenueConsensus: null, epsConsensus: 12, targetPrice: null, analystCount: null, highEstimate: null, lowEstimate: null }], new Date("2026-08-31T12:00:00Z"));
    expect(result.eps.days30).toBeNull();
    expect(result.momentum.label).toBe("Neutral");
  });
});
