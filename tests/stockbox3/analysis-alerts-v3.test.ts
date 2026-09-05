import { describe, expect, it } from "vitest";
import { deriveAnalysisAlertsV3, type AnalysisAlertSnapshotV3 } from "@/lib/alerts/analysis-alerts-v3";

function snapshot(overrides: Partial<AnalysisAlertSnapshotV3> = {}): AnalysisAlertSnapshotV3 {
  return {
    ticker: "MSFT",
    analysisId: "analysis-1",
    observedAt: "2026-09-05T12:00:00.000Z",
    rating: "BUY",
    objectiveScore: 74,
    conviction: 82,
    dataQuality: 91,
    price: 100,
    currency: "USD",
    ...overrides,
  };
}

describe("Analysis Alerts V3", () => {
  it("treats the first observation as a baseline", () => {
    expect(deriveAnalysisAlertsV3(null, snapshot())).toEqual([]);
  });

  it("alerts on an objective recommendation change with stable dedupe identity", () => {
    const previous = snapshot({ analysisId: "analysis-1", rating: "BUY" });
    const current = snapshot({ analysisId: "analysis-2", rating: "WAIT" });
    const first = deriveAnalysisAlertsV3(previous, current);
    const second = deriveAnalysisAlertsV3(previous, current);

    expect(first).toHaveLength(1);
    expect(first[0]?.kind).toBe("RECOMMENDATION_CHANGE");
    expect(first[0]?.severity).toBe("important");
    expect(first[0]?.dedupeKey).toBe(second[0]?.dedupeKey);
  });

  it("does not expose or accept a personalized user-match score", () => {
    const alerts = deriveAnalysisAlertsV3(
      snapshot({ conviction: 90 }),
      snapshot({ analysisId: "analysis-2", conviction: 60 }),
    );
    expect(alerts.some((event) => event.kind === "CONVICTION_DROP")).toBe(true);
    expect(JSON.stringify(alerts)).not.toContain("userMatch");
    expect(JSON.stringify(alerts)).not.toContain("personalized");
  });

  it("alerts only when a configured upper price threshold is crossed", () => {
    const crossed = deriveAnalysisAlertsV3(
      snapshot({ price: 99 }),
      snapshot({ analysisId: "analysis-2", price: 101 }),
      { priceAbove: 100 },
    );
    const stillAbove = deriveAnalysisAlertsV3(
      snapshot({ price: 101 }),
      snapshot({ analysisId: "analysis-3", price: 102 }),
      { priceAbove: 100 },
    );
    expect(crossed.some((event) => event.kind === "PRICE_ABOVE")).toBe(true);
    expect(stillAbove.some((event) => event.kind === "PRICE_ABOVE")).toBe(false);
  });

  it("raises an important data-quality alert when integrity meaningfully deteriorates", () => {
    const alerts = deriveAnalysisAlertsV3(
      snapshot({ dataQuality: 92 }),
      snapshot({ analysisId: "analysis-2", dataQuality: 50 }),
    );
    const event = alerts.find((item) => item.kind === "DATA_QUALITY_DROP");
    expect(event?.severity).toBe("important");
    expect(event?.payload.drop).toBe(42);
  });

  it("does not emit cross-company comparison noise", () => {
    expect(
      deriveAnalysisAlertsV3(snapshot({ ticker: "MSFT" }), snapshot({ ticker: "AAPL", analysisId: "analysis-2" })),
    ).toEqual([]);
  });
});
