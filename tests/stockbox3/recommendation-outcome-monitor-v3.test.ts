import { describe, expect, it } from "vitest";
import {
  buildDueRecommendationOutcomeWorkV3,
  recommendationOutcomeJobDedupeKeyV3,
  selectEntryPriceObservationV3,
  selectHorizonPriceObservationV3,
  type RecommendationAuditForOutcomeV3,
} from "@/lib/monitoring/recommendation-outcome-monitor-v3";
import type { MarketSnapshot } from "@/lib/analysis/types";

function audit(overrides: Partial<RecommendationAuditForOutcomeV3> = {}): RecommendationAuditForOutcomeV3 {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    observed_at: "2026-09-01T12:00:00.000Z",
    ticker: "MSFT",
    analysis_fingerprint: "fp-1",
    analysis_archetype: "standard",
    model_version: "model-v3",
    recommendation_policy_version: "policy-v3",
    v3_rating: "BUY",
    objective_score: 75,
    conviction: 80,
    data_quality: 90,
    model_uncertainty: 15,
    reason_codes: [],
    ...overrides,
  };
}

function market(points: Array<[string, number]>): MarketSnapshot {
  return {
    ticker: "MSFT",
    price: points.at(-1)?.[1] ?? null,
    currency: "USD",
    date: points.at(-1)?.[0] ?? null,
    volume: null,
    yearHigh: null,
    yearLow: null,
    priceHistory: points.map(([date, close]) => ({ date, close })),
    performance: {},
    provider: "test-market",
  };
}

describe("Recommendation outcome monitoring V3", () => {
  it("schedules only due and missing horizons", () => {
    const work = buildDueRecommendationOutcomeWorkV3({
      audits: [audit()],
      completed: new Map([[audit().id, new Set(["1d", "7d"])]]),
      now: new Date("2026-10-10T12:00:00.000Z"),
    });

    expect(work.map((item) => item.horizon)).toEqual(["30d"]);
    expect(work[0]?.audit.id).toBe(audit().id);
  });

  it("does not schedule non-directional or unavailable recommendations for performance learning", () => {
    const work = buildDueRecommendationOutcomeWorkV3({
      audits: [audit({ id: "hold", v3_rating: "HOLD" }), audit({ id: "wait", v3_rating: "WAIT" }), audit({ id: "na", v3_rating: "UNAVAILABLE" })],
      completed: new Map(),
      now: new Date("2027-10-10T12:00:00.000Z"),
    });

    expect(work).toEqual([]);
  });

  it("selects the latest verified close at or before snapshot time for entry", () => {
    const result = selectEntryPriceObservationV3(market([
      ["2026-08-28", 99],
      ["2026-08-31", 100],
      ["2026-09-02", 104],
    ]), "2026-09-01T12:00:00.000Z");

    expect(result).toEqual(expect.objectContaining({ price: 100, observedAt: "2026-08-31" }));
  });

  it("selects the first verified close at or after horizon target and tolerates weekends", () => {
    const result = selectHorizonPriceObservationV3(market([
      ["2026-09-04", 100],
      ["2026-09-07", 103],
      ["2026-09-08", 104],
    ]), "2026-09-05T12:00:00.000Z");

    expect(result).toEqual(expect.objectContaining({ price: 103, observedAt: "2026-09-07" }));
  });

  it("fails closed when no sufficiently close market observation exists", () => {
    expect(selectEntryPriceObservationV3(market([["2026-08-01", 90]]), "2026-09-01T12:00:00.000Z")).toBeNull();
    expect(selectHorizonPriceObservationV3(market([["2026-10-20", 120]]), "2026-10-01T12:00:00.000Z")).toBeNull();
  });

  it("uses a stable per-audit per-horizon dedupe key", () => {
    expect(recommendationOutcomeJobDedupeKeyV3(audit().id, "90d"))
      .toBe("recommendation-outcome:00000000-0000-4000-8000-000000000001:90d");
  });
});
