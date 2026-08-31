import { describe, expect, it } from "vitest";
import { computeDcfRange } from "../../src/lib/analysis";
import { runWithOfficialAnalysisContext } from "../../src/lib/data/official-analysis-context";
import { durableCompounderInput } from "./fixtures";

describe("official risk-free benchmark integration", () => {
  it("uses a verified official benchmark in WACC and preserves provenance", async () => {
    const result = await runWithOfficialAnalysisContext(
      {
        riskFreeRate: 0.025,
        riskFreeSource: "Sveriges Riksbank — 10Y government bond",
        riskFreeAsOf: "2026-08-31",
      },
      async () => computeDcfRange(durableCompounderInput),
    );

    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.assumptionQuality?.assumptions.riskFreeRate).toEqual(expect.objectContaining({
      value: 0.025,
      source: "Sveriges Riksbank — 10Y government bond",
      asOf: "2026-08-31",
      valueKind: "market_sourced",
    }));
    expect(result.assumptionNotes).toEqual(expect.arrayContaining([
      expect.stringContaining("Verified official risk-free benchmark: 2.500%"),
    ]));
  });

  it("keeps explicit analysis configuration above the official benchmark", async () => {
    const input = {
      ...durableCompounderInput,
      dcfAssumptions: {
        ...(durableCompounderInput.dcfAssumptions ?? {}),
        riskFreeRate: 0.031,
      },
    };
    const result = await runWithOfficialAnalysisContext(
      {
        riskFreeRate: 0.025,
        riskFreeSource: "Sveriges Riksbank — 10Y government bond",
        riskFreeAsOf: "2026-08-31",
      },
      async () => computeDcfRange(input),
    );

    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.assumptionQuality?.assumptions.riskFreeRate).toEqual(expect.objectContaining({
      value: 0.031,
      source: "Analysis configuration",
      valueKind: "configured",
    }));
  });
});
