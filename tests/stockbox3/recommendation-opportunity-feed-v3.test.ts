import { describe, expect, it } from "vitest";
import {
  buildRecommendationOpportunityFeedV3,
  type RecommendationOpportunityAuditV3,
} from "@/lib/analysis/recommendation-opportunity-feed-v3";

function audit(overrides: Partial<RecommendationOpportunityAuditV3> = {}): RecommendationOpportunityAuditV3 {
  return {
    id: "audit-1",
    observedAt: "2026-09-09T08:00:00.000Z",
    ticker: "MSFT",
    analysisArchetype: "standard",
    modelVersion: "model-v3",
    recommendationPolicyVersion: "policy-v3",
    rating: "BUY",
    objectiveScore: 78,
    conviction: 82,
    dataQuality: 90,
    modelUncertainty: 18,
    reasonCodes: ["VALUATION_SUPPORTIVE", "QUALITY_STRONG"],
    verifiedCoverage: 0.92,
    recommendationEligible: true,
    recommendationIntegrityEligible: true,
    confidenceGatePassed: true,
    confidenceGateHardBlocked: false,
    dataIntegrityScore: 94,
    ...overrides,
  };
}

describe("Recommendation opportunity feed V3", () => {
  it("ranks only recommendation-eligible objective snapshots and keeps blocked rows out", () => {
    const feed = buildRecommendationOpportunityFeedV3([
      audit({ id: "msft", ticker: "MSFT", objectiveScore: 80 }),
      audit({ id: "aapl", ticker: "AAPL", rating: "STRONG_BUY", objectiveScore: 88, conviction: 90 }),
      audit({ id: "bad", ticker: "BAD", rating: "STRONG_BUY", objectiveScore: 99, confidenceGateHardBlocked: true }),
    ]);

    expect(feed.top.map((item) => item.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(feed.top.some((item) => item.ticker === "BAD")).toBe(false);
    expect(feed.strongBuy.map((item) => item.ticker)).toEqual(["AAPL"]);
  });

  it("never markets REDUCE/SELL or weak-data rows as opportunities", () => {
    const feed = buildRecommendationOpportunityFeedV3([
      audit({ id: "buy", ticker: "BUYME", rating: "BUY", objectiveScore: 75 }),
      audit({ id: "sell", ticker: "SELLME", rating: "SELL", objectiveScore: 99, analysisArchetype: "etf", reasonCodes: ["QUALITY_STRONG"] }),
      audit({ id: "reduce", ticker: "REDUCE", rating: "REDUCE", objectiveScore: 96, reasonCodes: ["VALUATION_SUPPORTIVE"] }),
      audit({ id: "weak-quality", ticker: "WEAKQ", rating: "STRONG_BUY", objectiveScore: 98, dataQuality: 49 }),
      audit({ id: "weak-integrity", ticker: "WEAKI", rating: "STRONG_BUY", objectiveScore: 98, dataIntegrityScore: 54 }),
      audit({ id: "weak-coverage", ticker: "WEAKC", rating: "STRONG_BUY", objectiveScore: 98, verifiedCoverage: 0.49 }),
    ]);

    expect(feed.top.map((item) => item.ticker)).toEqual(["BUYME"]);
    expect(feed.etf.some((item) => item.ticker === "SELLME")).toBe(false);
    expect(feed.quality.some((item) => item.ticker === "SELLME")).toBe(false);
    expect(feed.valuation.some((item) => item.ticker === "REDUCE")).toBe(false);
    expect(feed.top.some((item) => item.ticker.startsWith("WEAK"))).toBe(false);
  });

  it("keeps HOLD/WAIT in Watch but not in Top Opportunities", () => {
    const feed = buildRecommendationOpportunityFeedV3([
      audit({ id: "hold", ticker: "HOLDME", rating: "HOLD", objectiveScore: 88 }),
      audit({ id: "wait", ticker: "WAITME", rating: "WAIT", objectiveScore: 87 }),
      audit({ id: "buy", ticker: "BUYME", rating: "BUY", objectiveScore: 72 }),
    ]);

    expect(feed.watch.map((item) => item.ticker).sort()).toEqual(["HOLDME", "WAITME"]);
    expect(feed.top.map((item) => item.ticker)).toEqual(["BUYME"]);
  });

  it("builds specialist/category sections from auditable archetype and reason codes", () => {
    const feed = buildRecommendationOpportunityFeedV3([
      audit({ id: "spy", ticker: "SPY", analysisArchetype: "etf", rating: "BUY", reasonCodes: ["MOMENTUM_SUPPORTIVE"] }),
      audit({ id: "msft", ticker: "MSFT", reasonCodes: ["VALUATION_SUPPORTIVE", "QUALITY_STRONG"] }),
      audit({ id: "contra", ticker: "CONTRA", reasonCodes: ["CONTRARIAN_SETUP"], objectiveScore: 75 }),
    ]);

    expect(feed.etf.map((item) => item.ticker)).toContain("SPY");
    expect(feed.momentum.map((item) => item.ticker)).toContain("SPY");
    expect(feed.valuation.map((item) => item.ticker)).toContain("MSFT");
    expect(feed.quality.map((item) => item.ticker)).toContain("MSFT");
    expect(feed.contrarian.map((item) => item.ticker)).toContain("CONTRA");
  });

  it("derives What changed from the latest two objective snapshots per ticker", () => {
    const feed = buildRecommendationOpportunityFeedV3([
      audit({ id: "old", observedAt: "2026-09-08T08:00:00.000Z", objectiveScore: 70, conviction: 70 }),
      audit({ id: "new", observedAt: "2026-09-09T08:00:00.000Z", objectiveScore: 78, conviction: 82 }),
    ]);

    expect(feed.whatChanged).toHaveLength(1);
    expect(feed.whatChanged[0]).toMatchObject({
      ticker: "MSFT",
      state: "STRENGTHENED",
      previousRating: "BUY",
      currentRating: "BUY",
      reconsider: false,
    });
  });

  it("shows a closed recommendation in What changed even though it cannot remain an opportunity", () => {
    const feed = buildRecommendationOpportunityFeedV3([
      audit({ id: "old", observedAt: "2026-09-08T08:00:00.000Z", rating: "BUY" }),
      audit({
        id: "new",
        observedAt: "2026-09-09T08:00:00.000Z",
        rating: "UNAVAILABLE",
        objectiveScore: null,
        recommendationEligible: false,
        recommendationIntegrityEligible: false,
        confidenceGatePassed: false,
      }),
    ]);

    expect(feed.top).toHaveLength(0);
    expect(feed.whatChanged[0]).toMatchObject({ state: "CLOSED", reconsider: true });
  });

  it("flags high-risk/high-upside without hiding uncertainty", () => {
    const feed = buildRecommendationOpportunityFeedV3([
      audit({
        id: "risk",
        ticker: "RISK",
        objectiveScore: 84,
        conviction: 78,
        modelUncertainty: 66,
        reasonCodes: ["UPSIDE_OPTIONALITY"],
      }),
    ]);

    expect(feed.highRiskHighUpside[0]?.ticker).toBe("RISK");
    expect(feed.highRiskHighUpside[0]?.modelUncertainty).toBe(66);
  });
});
