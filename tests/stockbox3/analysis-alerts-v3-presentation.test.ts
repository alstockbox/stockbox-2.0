import { describe, expect, it } from "vitest";
import { presentAnalysisAlertEventV3, type StoredAnalysisAlertEventV3 } from "@/lib/alerts/presentation-v3";

function event(overrides: Partial<StoredAnalysisAlertEventV3> = {}): StoredAnalysisAlertEventV3 {
  return {
    ticker: "MSFT",
    alert_kind: "RECOMMENDATION_CHANGE",
    severity: "important",
    message_key: "alerts.recommendation_change",
    payload: { from: "BUY", to: "WAIT" },
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

  it("states that data-quality deterioration is not a company rating", () => {
    const result = presentAnalysisAlertEventV3(event({
      alert_kind: "DATA_QUALITY_DROP",
      message_key: "alerts.data_quality_drop",
      payload: { previous: 92, current: 61, drop: 31 },
    }), "sv");
    expect(result.body).toContain("datavarning");
    expect(result.body).toContain("inte ett bolagsbetyg");
  });

  it("renders price crossing direction and currency", () => {
    const result = presentAnalysisAlertEventV3(event({
      alert_kind: "PRICE_ABOVE",
      message_key: "alerts.price_above",
      payload: { currentPrice: 410.25, threshold: 400, currency: "USD" },
    }), "en");
    expect(result.body).toContain("above");
    expect(result.body).toContain("USD");
    expect(result.body).toContain("400");
  });
});
