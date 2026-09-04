import { describe, expect, it } from "vitest";
import { resolveVisualSources } from "@/lib/growth/visual-source";

describe("growth visual source resolution", () => {
  it("prefers structured StockBox data for chart scenes", () => {
    expect(resolveVisualSources(
      { kind: "chart", metricKey: "net_debt_to_ebitda", headline: "Skuld" },
      {
        structured: { net_debt_to_ebitda: { value: 2.1, label: "Nettoskuld / EBITDA" } },
        captures: {},
        curated: {},
      },
    )).toMatchObject({ kind: "structured_chart", payload: { value: 2.1 } });
  });

  it("uses a controlled capture when explicitly supplied and structured data is absent", () => {
    expect(resolveVisualSources(
      { kind: "stockbox_ui", captureId: "analysis-demo", headline: "StockBox-analys" },
      { structured: {}, captures: { "analysis-demo": { assetId: "capture-42" } }, curated: {} },
    )).toEqual({ kind: "controlled_capture", assetId: "capture-42" });
  });

  it("uses a curated branded frame before generic motion fallback", () => {
    expect(resolveVisualSources(
      { kind: "stockbox_ui", curatedId: "risk-score", headline: "Risk" },
      { structured: {}, captures: {}, curated: { "risk-score": { assetId: "curated-risk" } } },
    )).toEqual({ kind: "curated_frame", assetId: "curated-risk" });
  });

  it("always resolves missing assets to a motion fallback", () => {
    expect(resolveVisualSources(
      { kind: "chart", metricKey: "missing", headline: "Se utvecklingen", body: "Jämför flera år." },
      { structured: {}, captures: {}, curated: {} },
    )).toEqual({ kind: "motion_fallback", headline: "Se utvecklingen", body: "Jämför flera år." });
  });
});
