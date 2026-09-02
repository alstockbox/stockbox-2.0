import { describe, expect, it } from "vitest";
import {
  analyzeStock,
  historicalPercentile,
  premiumDiscountPercent,
  selectApplicableMetrics
} from "../../src/lib/stockbox/analysis-engine";

describe("stockbox analysis engine", () => {
  it("calculates signed premium and discount against the named benchmark", () => {
    expect(premiumDiscountPercent("forwardPe", 26, 21)).toBeCloseTo(23.8095, 4);
    expect(premiumDiscountPercent("forwardPe", 18, 21)).toBeCloseTo(-14.2857, 4);
  });

  it("treats yield metrics in the opposite direction from valuation multiples", () => {
    expect(premiumDiscountPercent("fcfYield", 4, 5)).toBeCloseTo(25, 4);
    expect(premiumDiscountPercent("fcfYield", 6, 5)).toBeCloseTo(-16.6667, 4);
  });

  it("uses sector-aware metric selection and rejects non-meaningful negative earnings multiples", () => {
    const bankMetrics = selectApplicableMetrics("bank", { pe: -12, pb: 1.4, forwardPe: 10, evSales: 8 });
    expect(bankMetrics).toEqual(["pb", "forwardPe"]);
  });

  it("protects comparisons from outlier multiples", () => {
    const metrics = selectApplicableMetrics("industrials", { pe: 950, evEbitda: 13, pFcf: 40 });
    expect(metrics).toEqual(["evEbitda", "pFcf"]);
  });

  it("calculates historical valuation percentile with cleaned observations", () => {
    expect(historicalPercentile(30, [10, 12, 14, 16, 18, 20, 22, 30, 950])).toBeCloseTo(88.8889, 4);
  });

  it("creates one structured analysis object consumed by beginner and deep reports", () => {
    const analysis = analyzeStock({
      company: { name: "Quality SaaS", ticker: "QS", sector: "saas" },
      current: {
        evSales: 12,
        ps: 11,
        fcfYield: 2.5,
        revenueGrowth: 28,
        fcfMargin: 12,
        fcfConversion: 92,
        roic: 18,
        netDebtToEbitda: -0.5,
        sharesGrowth: 1,
        revenueGrowthSeries: [15, 19, 24, 28],
        fcfMarginSeries: [5, 8, 10, 12]
      },
      benchmarks: {
        industry: { evSales: 8, ps: 7, fcfYield: 3.5, revenueGrowth: 15, roic: 10, fcfMargin: 6 },
        sector: { evSales: 7, ps: 6, fcfYield: 4, revenueGrowth: 13 },
        sectorHistory: { evSales: [4, 5, 5.5, 6, 6.5, 7, 7, 8, 8.5, 9, 9.5, 10] }
      },
      history: { evSales: [5, 6, 6, 7, 8, 8, 9, 10, 10.5, 11, 11.5, 12] },
      peerCount: 7,
      dataFreshness: { priceAsOf: "2026-09-02", financialPeriod: "TTM Q2 2026" }
    });

    expect(analysis.valuation.industryRelative[0].premiumPercent).toBeCloseTo(50, 4);
    expect(analysis.valuation.premiumJustification.level).toMatch(/justified/i);
    expect(analysis.reportLevels.forDummies.join(" ")).toContain("Quality SaaS");
    expect(analysis.reportLevels.deep.join(" ")).toContain("Premium justification");
    expect(analysis.score.components.valuation).toBeLessThan(analysis.score.businessQuality);
    expect(analysis.confidence.level).toBe("High");
  });

  it("marks missing benchmark and history data instead of fabricating context", () => {
    const analysis = analyzeStock({
      company: { name: "Newly Listed Miner", ticker: "NLM", sector: "mining" },
      current: { evEbitda: 4.2, revenueGrowth: -12, netDebtToEbitda: 5.5, fcfConversion: 20, sharesGrowth: 12 }
    });

    expect(analysis.valuation.industryRelative).toEqual([]);
    expect(analysis.valuation.sectorRegime.regime).toBe("Insufficient data");
    expect(analysis.confidence.level).toBe("Low");
    expect(analysis.dataLimitations).toContain("Industry benchmark is missing.");
    expect(analysis.risks.valueTrapRisk).toBe("High");
  });
});
