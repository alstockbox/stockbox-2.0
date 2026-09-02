import { describe, expect, it } from "vitest";
import { buildBenchmarkValuationScore } from "@/lib/analysis/peer-benchmark";

describe("buildBenchmarkValuationScore", () => {
  it("converts multiple available valuation benchmark rows into an explainable score", () => {
    const report = {
      engine: {
        analysisArchetype: "standard",
        metrics: {
          valuation: { priceEarnings: 14, evEbitda: 8, evSales: 2, freeCashFlowYield: 0.08 },
          growth: {}, margins: {}, ratios: {},
        },
        scores: { sector: "technology", methodology: { benchmarkVersion: "fixture" } },
      },
    } as never;
    const result = buildBenchmarkValuationScore(report);
    expect(result.score).not.toBeNull();
    expect(result.coverage).toBeGreaterThanOrEqual(0.5);
    expect(result.detail).toMatch(/sector benchmark/i);
    expect(result.detail).toMatch(/not a live peer/i);
  });

  it("fails closed for holding companies instead of applying generic operating-company valuation", () => {
    const result = buildBenchmarkValuationScore({ engine: { analysisArchetype: "holding_company", metrics: {}, scores: { sector: "financials", methodology: { benchmarkVersion: "fixture" } } } } as never);
    expect(result.score).toBeNull();
    expect(result.detail).toMatch(/NAV|SOTP/i);
  });

  it("requires at least two valuation metrics so one cheap multiple cannot dominate", () => {
    const report = {
      engine: {
        analysisArchetype: "standard",
        metrics: { valuation: { priceEarnings: 10 }, growth: {}, margins: {}, ratios: {} },
        scores: { sector: "technology", methodology: { benchmarkVersion: "fixture" } },
      },
    } as never;
    const result = buildBenchmarkValuationScore(report);
    expect(result.score).toBeNull();
    expect(result.coverage).toBeLessThan(0.5);
  });
});
