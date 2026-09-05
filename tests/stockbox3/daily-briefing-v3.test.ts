import { describe, expect, it } from "vitest";
import { composeDailyBriefingV3, type DailyBriefingFactV3 } from "@/lib/briefing/daily-briefing-v3";

const now = new Date("2026-09-05T20:00:00.000Z");

function stockbox(overrides: Partial<Extract<DailyBriefingFactV3, { source: "stockbox_alert" }>> = {}): Extract<DailyBriefingFactV3, { source: "stockbox_alert" }> {
  return {
    source: "stockbox_alert",
    sourceId: "alert-1",
    ticker: "MSFT",
    kind: "RECOMMENDATION_CHANGE",
    severity: "important",
    messageKey: "alerts.recommendationChanged",
    payload: { previousRating: "BUY", currentRating: "WAIT" },
    observedAt: "2026-09-05T19:00:00.000Z",
    ...overrides,
  };
}

describe("Daily Briefing V3", () => {
  it("uses a rolling bounded time window and excludes future/stale facts", () => {
    const briefing = composeDailyBriefingV3({
      now,
      facts: [
        stockbox(),
        stockbox({ sourceId: "stale", observedAt: "2026-09-04T19:59:59.000Z" }),
        stockbox({ sourceId: "future", observedAt: "2026-09-05T20:00:01.000Z" }),
      ],
    });
    expect(briefing.windowStart).toBe("2026-09-04T20:00:00.000Z");
    expect(briefing.facts).toHaveLength(1);
    expect(briefing.facts[0]?.sourceId).toBe("alert-1");
  });

  it("deduplicates identical source facts and keeps the newest observation", () => {
    const briefing = composeDailyBriefingV3({
      now,
      facts: [
        stockbox({ observedAt: "2026-09-05T18:00:00.000Z" }),
        stockbox({ observedAt: "2026-09-05T19:00:00.000Z" }),
      ],
    });
    expect(briefing.facts).toHaveLength(1);
    expect(briefing.facts[0]?.observedAt).toBe("2026-09-05T19:00:00.000Z");
  });

  it("prioritizes severity first and objective StockBox facts before same-severity official facts", () => {
    const facts: DailyBriefingFactV3[] = [
      {
        source: "official_monitoring",
        sourceId: "official-important",
        ticker: "AAPL",
        kind: "filing",
        severity: "important",
        dataAsOf: null,
        observedAt: "2026-09-05T19:30:00.000Z",
      },
      stockbox({ observedAt: "2026-09-05T18:30:00.000Z" }),
      stockbox({ sourceId: "watch", severity: "watch", observedAt: "2026-09-05T19:50:00.000Z" }),
    ];
    const briefing = composeDailyBriefingV3({ now, facts });
    expect(briefing.facts.map((fact) => fact.sourceId)).toEqual(["alert-1", "official-important", "watch"]);
  });

  it("does not treat a portfolio snapshot alone as a material market change", () => {
    const facts: DailyBriefingFactV3[] = [{
      source: "portfolio_snapshot",
      sourceId: "portfolio-1",
      portfolioId: "p1",
      baseCurrency: "SEK",
      portfolioValue: 10000,
      investedCapital: 9000,
      unrealizedPl: 1000,
      unrealizedPlPercent: 11.1,
      portfolioScore: 72,
      riskScore: 63,
      diversificationScore: 58,
      completeValuation: true,
      observedAt: "2026-09-05T18:00:00.000Z",
    }];
    const briefing = composeDailyBriefingV3({ now, facts });
    expect(briefing.hasMaterialChanges).toBe(false);
    expect(briefing.counts.portfolio).toBe(1);
  });

  it("caps requested window and fact count to prevent unbounded reads/rendering", () => {
    const facts = Array.from({ length: 150 }, (_, index) => stockbox({
      sourceId: `a-${index}`,
      observedAt: "2026-09-05T19:00:00.000Z",
    }));
    const briefing = composeDailyBriefingV3({ now, hours: 1000, maxFacts: 1000, facts });
    expect(briefing.hours).toBe(168);
    expect(briefing.facts).toHaveLength(100);
  });

  it("has no contract field for User Match, personalized score or personalized rating", () => {
    const briefing = composeDailyBriefingV3({ now, facts: [stockbox()] });
    const serialized = JSON.stringify(briefing);
    expect(serialized).not.toContain("userMatch");
    expect(serialized).not.toContain("personalizedScore");
    expect(serialized).not.toContain("personalizedRating");
  });
});
