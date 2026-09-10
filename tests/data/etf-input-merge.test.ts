import { describe, expect, it } from "vitest";
import type { EtfAnalysisInput } from "../../src/lib/analysis/universal-security";
import { mergeEtfAnalysisInputs } from "../../src/lib/data/etf-input-merge";

describe("ETF specialist provider merge", () => {
  it("keeps verified primary scalars while filling missing fields from fallback", () => {
    const primary: EtfAnalysisInput = {
      subtype: "index_etf",
      expenseRatio: 0.002,
      turnover: null,
      assetsUnderManagement: 100_000_000_000,
      numberOfHoldings: 100,
      sectorHhi: null,
    };
    const fallback: EtfAnalysisInput = {
      expenseRatio: 0.0025,
      turnover: 0.05,
      assetsUnderManagement: 98_000_000_000,
      sectorHhi: 0.22,
    };

    const merged = mergeEtfAnalysisInputs(primary, fallback);

    expect(merged.input.expenseRatio).toBe(0.002);
    expect(merged.input.assetsUnderManagement).toBe(100_000_000_000);
    expect(merged.input.turnover).toBe(0.05);
    expect(merged.input.sectorHhi).toBe(0.22);
    expect(merged.fallbackFields).toEqual(expect.arrayContaining(["turnover", "sectorHhi"]));
    expect(merged.fallbackFields).not.toContain("expenseRatio");
  });

  it("uses the holdings set with materially better represented portfolio weight", () => {
    const primary: EtfAnalysisInput = {
      holdings: [
        { ticker: "A", name: "A", weight: 0.12 },
        { ticker: "B", name: "B", weight: 0.08 },
      ],
    };
    const fallback: EtfAnalysisInput = {
      holdings: [
        { ticker: "A", name: "A", weight: 0.4 },
        { ticker: "B", name: "B", weight: 0.3 },
        { ticker: "C", name: "C", weight: 0.2 },
        { ticker: "D", name: "D", weight: 0.1 },
      ],
    };

    const merged = mergeEtfAnalysisInputs(primary, fallback);

    expect(merged.input.holdings).toHaveLength(4);
    expect(merged.input.holdings?.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 8);
    expect(merged.fallbackFields).toContain("holdings");
  });

  it("does not replace a complete primary holdings set merely because fallback has more rows", () => {
    const primary: EtfAnalysisInput = {
      holdings: [
        { ticker: "A", name: "A", weight: 0.55 },
        { ticker: "B", name: "B", weight: 0.45 },
      ],
    };
    const fallback: EtfAnalysisInput = {
      holdings: [
        { ticker: "A", name: "A", weight: 0.5 },
        { ticker: "B", name: "B", weight: 0.3 },
        { ticker: "C", name: "C", weight: 0.15 },
        { ticker: "D", name: "D", weight: 0.05 },
      ],
    };

    const merged = mergeEtfAnalysisInputs(primary, fallback);

    expect(merged.input.holdings).toEqual(primary.holdings);
    expect(merged.fallbackFields).not.toContain("holdings");
  });
});
