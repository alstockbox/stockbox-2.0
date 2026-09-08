import { describe, expect, it } from "vitest";
import { deriveAnalysisAlertsV3, type AnalysisAlertSnapshotV3 } from "@/lib/alerts/analysis-alerts-v3";
import { presentAnalysisAlertEventV3, type StoredAnalysisAlertEventV3 } from "@/lib/alerts/presentation-v3";

function event(overrides: Partial<StoredAnalysisAlertEventV3> = {}): StoredAnalysisAlertEventV3 {
  return {
    ticker: "MSFT",
    alert_kind: "RECOMMENDATION_CHANGE",
    severity: "important",
    message_key: "alerts.recommendationChanged",
    payload: { previousRating: "BUY", currentRating: "WAIT", previousScore: 74, currentScore: 52 },
    observed_at: "2026-09-05T20:00:00.000Z",
    ...overrides,
  };
}

describe("Analysis Alerts V3 presentation", () => {
  it("renders objective Swedish rating copy without English label mixing", () => {
    const result = presentAnalysisAlertEventV3(event(), "sv");
    expect(result.title).toContain("ratingen ändrades");
    expect(result.body).toContain("KÖP");
    expect(result.body).toContain("AVVAKTA");
    expect(result.body).not.toContain("BUY");
    expect(result.body).not.toContain("WAIT");
  });

  it("renders English rating copy independently", () => {
    const result = presentAnalysisAlertEventV3(event(), "en");
    expect(result.title).toContain("rating changed");
    expect(result.body).toContain("BUY");
    expect(result.body).toContain("WAIT");
  });

  it("explains a same-rating weakening without claiming the rating changed", () => {
    const result = presentAnalysisAlertEventV3(event({
      severity: "watch",
      message_key: "alerts.recommendationWeakened",
      payload: { currentRating: "BUY", previousScore: 80, currentScore: 72, scoreDelta: -8 },
    }), "sv");

    expect(result.title).toContain("försvagades");
    expect(result.body).toContain("kvar på KÖP");
    expect(result.body).toContain("80");
    expect(result.body).toContain("72");
    expect(result.body).not.toContain("ratingen ändrades");
  });

  it("explains a same-rating strengthening in English", () => {
    const result = presentAnalysisAlertEventV3(event({
      severity: "watch",
      message_key: "alerts.recommendationStrengthened",
      payload: { currentRating: "HOLD", previousScore: 61, currentScore: 69, scoreDelta: 8 },
    }), "en");

    expect(result.title).toContain("strengthened");
    expect(result.body).toContain("remains HOLD");
    expect(result.body).toContain("61");
    expect(result.body).toContain("69");
  });

  it("states that data-quality deterioration is not a company rating", () => {
    const result = presentAnalysisAlertEventV3(event({
      alert_kind: "DATA_QUALITY_DROP",
      message_key: "alerts.dataQualityDropped",
      payload: { previousDataQuality: 92, currentDataQuality: 61, drop: 31 },
    }), "sv");
    expect(result.body).toContain("datavarning");
    expect(result.body).toContain("inte ett bolagsbetyg");
  });

  it("renders price crossing direction and currency", () => {
    const result = presentAnalysisAlertEventV3(event({
      alert_kind: "PRICE_ABOVE",
      message_key: "alerts.priceCrossedAbove",
      payload: { currentPrice: 410.25, threshold: 400, currency: "USD" },
    }), "en");
    expect(result.body).toContain("above");
    expect(result.body).toContain("USD");
    expect(result.body).toContain("400");
  });

  it("accepts the actual message key and payload emitted by the alert engine", () => {
    const previous: AnalysisAlertSnapshotV3 = {
      ticker: "MSFT",
      analysisId: "a1",
      observedAt: "2026-09-05T10:00:00.000Z",
      rating: "BUY",
      objectiveScore: 74,
      conviction: 80,
      dataQuality: 92,
      price: 400,
      currency: "USD",
    };
    const current: AnalysisAlertSnapshotV3 = {
      ...previous,
      analysisId: "a2",
      observedAt: "2026-09-05T20:00:00.000Z",
      rating: "WAIT",
      objectiveScore: 52,
    };
    const [engineEvent] = deriveAnalysisAlertsV3(previous, current, { recommendationChanges: true });
    expect(engineEvent?.messageKey).toBe("alerts.recommendationChanged");
    expect(engineEvent?.payload).toMatchObject({ previousRating: "BUY", currentRating: "WAIT" });
    if (!engineEvent) throw new Error("expected recommendation-change event");

    const presented = presentAnalysisAlertEventV3({
      ticker: engineEvent.ticker,
      alert_kind: engineEvent.kind,
      severity: engineEvent.severity,
      message_key: engineEvent.messageKey,
      payload: engineEvent.payload,
      observed_at: engineEvent.observedAt,
    }, "sv");
    expect(presented.body).toContain("KÖP");
    expect(presented.body).toContain("AVVAKTA");
  });
});
