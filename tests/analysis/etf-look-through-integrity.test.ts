import { describe, expect, it } from "vitest";
import { analyzeEtf, computeLookThroughMetrics } from "../../src/lib/analysis/universal-security";

describe("ETF look-through completeness integrity", () => {
  it("keeps full-portfolio HHI unavailable when holdings represent less than 95% of portfolio weight", () => {
    const metrics = computeLookThroughMetrics([
      { name: "A", weight: 0.12, sector: "Technology", country: "US" },
      { name: "B", weight: 0.08, sector: "Healthcare", country: "US" },
    ]);

    expect(metrics.coveredWeight).toBeCloseTo(0.2, 8);
    expect(metrics.top10Weight).toBeCloseTo(0.2, 8);
    expect(metrics.largestHoldingWeight).toBeCloseTo(0.12, 8);
    expect(metrics.holdingsHhi).toBeNull();
    expect(metrics.sectorHhi).toBeNull();
    expect(metrics.countryHhi).toBeNull();
  });

  it("computes HHI from actual portfolio weights once at least 95% is represented", () => {
    const metrics = computeLookThroughMetrics([
      { name: "A", weight: 0.6, sector: "Technology", country: "US" },
      { name: "B", weight: 0.35, sector: "Healthcare", country: "SE" },
    ]);

    expect(metrics.coveredWeight).toBeCloseTo(0.95, 8);
    expect(metrics.holdingsHhi).toBeCloseTo(0.4825, 8);
    expect(metrics.sectorHhi).toBeCloseTo(0.4825, 8);
    expect(metrics.countryHhi).toBeCloseTo(0.4825, 8);
  });

  it("does not let the ETF diversification factor recover HHI from a partial holdings list", () => {
    const result = analyzeEtf({
      subtype: "index_etf",
      holdings: [
        { name: "A", weight: 0.12, sector: "Technology" },
        { name: "B", weight: 0.08, sector: "Healthcare" },
      ],
    });

    expect(result.lookThrough.holdingsHhi).toBeNull();
    expect(result.lookThrough.sectorHhi).toBeNull();
    expect(result.score.factors.find((factor) => factor.key === "diversification")).toMatchObject({
      status: "missing",
      score: null,
    });
  });

  it("does not treat nominal holdings count as standalone diversification evidence", () => {
    const result = analyzeEtf({
      subtype: "index_etf",
      numberOfHoldings: 500,
    });

    expect(result.score.factors.find((factor) => factor.key === "diversification")).toMatchObject({
      status: "missing",
      score: null,
    });
  });
});
