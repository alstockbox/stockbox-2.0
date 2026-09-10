import { describe, expect, it } from "vitest";
import { summarizeEtfHoldingConcentration } from "../../src/lib/data/etf-holdings-math";

describe("ETF holdings concentration integrity", () => {
  it("does not claim full-portfolio HHI from a partial top-holdings list", () => {
    const result = summarizeEtfHoldingConcentration([
      { ticker: "A", name: "A", weight: 0.12 },
      { ticker: "B", name: "B", weight: 0.08 },
    ]);

    expect(result.representedWeight).toBeCloseTo(0.2, 8);
    expect(result.top10Weight).toBeCloseTo(0.2, 8);
    expect(result.largestHoldingWeight).toBeCloseTo(0.12, 8);
    expect(result.holdingsHhi).toBeNull();
  });

  it("computes HHI only when holdings represent at least 95% of the portfolio", () => {
    const result = summarizeEtfHoldingConcentration([
      { ticker: "A", name: "A", weight: 0.5 },
      { ticker: "B", name: "B", weight: 0.3 },
      { ticker: "C", name: "C", weight: 0.15 },
    ]);

    expect(result.representedWeight).toBeCloseTo(0.95, 8);
    expect(result.holdingsHhi).toBeCloseTo(0.3625, 8);
  });

  it("normalizes provider percentage-point weights before evaluating completeness", () => {
    const result = summarizeEtfHoldingConcentration([
      { ticker: "A", name: "A", weight: 50 },
      { ticker: "B", name: "B", weight: 30 },
      { ticker: "C", name: "C", weight: 15 },
    ]);

    expect(result.representedWeight).toBeCloseTo(0.95, 8);
    expect(result.top10Weight).toBeCloseTo(0.95, 8);
    expect(result.largestHoldingWeight).toBeCloseTo(0.5, 8);
    expect(result.holdingsHhi).toBeCloseTo(0.3625, 8);
  });
});
