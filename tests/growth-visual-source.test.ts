import { describe, expect, it } from "vitest";
import { resolveVisualSource } from "@/lib/growth/visual-source";

describe("growth visual source resolution", () => {
  it("prefers structured StockBox data for chart scenes", () => {
    expect(resolveVisualSource(
      { kind: "chart", metricKey: "net_debt_to_ebitda", headline: "Skuld" },
      { structured: { net_debt_to_ebitda: { value: 2.1 } }, captures: {}, curated: {} },
    )).toEqual({ kind: "structured_chart", payload: { value: 2.1 } });
  });

  it("uses a curated branded frame before a capture", () => {
    expect(resolveVisualSource(
      { kind: "stockbox_ui", curatedAssetId: "risk-card", captureAssetId: "capture-1", headline: "Risk" },
      { structured: {}, curated: { "risk-card": true }, captures: { "capture-1": true } },
    )).toEqual({ kind: "curated_frame", assetId: "risk-card" });
  });

  it("can use a controlled capture", () => {
    expect(resolveVisualSource(
      { kind: "stockbox_ui", captureAssetId: "capture-1", headline: "Analys" },
      { structured: {}, curated: {}, captures: { "capture-1": true } },
    )).toEqual({ kind: "controlled_capture", assetId: "capture-1" });
  });

  it("always resolves missing media to a deterministic motion fallback", () => {
    expect(resolveVisualSource(
      { kind: "chart", metricKey: "missing", headline: "Se utvecklingen", body: "Jämför flera år." },
      { structured: {}, curated: {}, captures: {} },
    )).toEqual({ kind: "motion_fallback", headline: "Se utvecklingen", body: "Jämför flera år." });
  });
});
