import { describe, expect, it } from "vitest";
import { evaluateThesis } from "./thesis";
import type { CompanyMetricSnapshot, ThesisRuleDefinition } from "./types";

function snapshot(overrides: Partial<CompanyMetricSnapshot> = {}): CompanyMetricSnapshot {
  return {
    ticker: "MSFT",
    companyName: "Microsoft",
    capturedAt: "2026-08-31T20:00:00.000Z",
    analysisId: "analysis-current",
    price: 182,
    priceChange1d: 0.01,
    score: 88,
    personalizedScore: 90,
    confidence: 0.86,
    coverage: 0.91,
    fairValue: 217,
    fairValueLow: 195,
    fairValueHigh: 235,
    fairValueUpside: 217 / 182 - 1,
    archetype: "software_growth",
    valuation: {
      pe: 22.4,
      forwardPe: 21,
      ps: 8,
      evSales: 7.8,
      evEbitda: 18,
      fcfYield: 0.041,
      dividendYield: 0.008,
      historicalPePercentile: 0.24,
      peVs5yMedian: -0.12,
      peVs10yMedian: -0.161,
    },
    fundamentals: {
      revenueGrowth: 0.087,
      epsGrowth: 0.11,
      fcf: 85_000_000_000,
      fcfGrowth: 0.09,
      fcfMargin: 0.28,
      grossMargin: 0.69,
      operatingMargin: 0.41,
      netMargin: 0.35,
      roic: 0.23,
      roe: 0.31,
      netDebt: -20_000_000_000,
      netDebtToEbitda: -0.2,
    },
    dividend: {
      yield: 0.008,
      payoutRatio: 0.25,
      fcfPayoutRatio: 0.2,
      growth: 0.08,
      dividendPerShare: 3.4,
    },
    estimates: {
      revenueGrowth: 0.12,
      epsGrowth: 0.14,
      fcfGrowth: null,
      targetPrice: null,
    },
    dimensions: { growth: 84, quality: 95, valuation: 75 },
    riskFlags: [],
    sourceMeta: {},
    ...overrides,
  };
}

const rules: ThesisRuleDefinition[] = [
  {
    id: "revenue-growth",
    label: "Revenue growth > 10%",
    metricKey: "fundamentals.revenueGrowth",
    operator: "gt",
    threshold: 0.1,
    critical: false,
    failureStatus: "WATCH",
  },
  {
    id: "fcf-positive",
    label: "FCF positive",
    metricKey: "fundamentals.fcf",
    operator: "gt",
    threshold: 0,
    critical: true,
    failureStatus: "WEAKENING",
  },
  {
    id: "roic",
    label: "ROIC > 15%",
    metricKey: "fundamentals.roic",
    operator: "gt",
    threshold: 0.15,
    critical: false,
    failureStatus: "WATCH",
  },
];

describe("evaluateThesis", () => {
  it("moves an intact thesis to watch when a non-critical requirement newly fails", () => {
    const result = evaluateThesis({
      currentStatus: "INTACT",
      snapshot: snapshot(),
      rules,
      previousResults: {
        "revenue-growth": "passed",
        "fcf-positive": "passed",
        roic: "passed",
      },
    });

    expect(result.status).toBe("WATCH");
    expect(result.failed.map((rule) => rule.ruleId)).toContain("revenue-growth");
    expect(result.newlyFailed).toEqual(["revenue-growth"]);
    expect(result.newlyRecovered).toEqual([]);
    expect(result.reasoning.join(" ")).toMatch(/Revenue growth/i);
  });

  it("uses the rule-defined failure status instead of automatically claiming a thesis is broken", () => {
    const result = evaluateThesis({
      currentStatus: "INTACT",
      snapshot: snapshot({ fundamentals: { ...snapshot().fundamentals, fcf: -1 } }),
      rules,
    });

    expect(result.status).toBe("WEAKENING");
    expect(result.status).not.toBe("BROKEN");
    expect(result.failed.map((rule) => rule.ruleId)).toContain("fcf-positive");
  });

  it("marks missing metrics unavailable instead of failing them", () => {
    const result = evaluateThesis({
      currentStatus: "INTACT",
      snapshot: snapshot({ fundamentals: { ...snapshot().fundamentals, roic: null } }),
      rules,
    });

    expect(result.unavailable.map((rule) => rule.ruleId)).toContain("roic");
    expect(result.failed.map((rule) => rule.ruleId)).not.toContain("roic");
  });

  it("detects a recovered rule without downgrading a strong thesis", () => {
    const result = evaluateThesis({
      currentStatus: "STRONG",
      snapshot: snapshot({ fundamentals: { ...snapshot().fundamentals, revenueGrowth: 0.13 } }),
      rules,
      previousResults: {
        "revenue-growth": "failed",
        "fcf-positive": "passed",
        roic: "passed",
      },
    });

    expect(result.status).toBe("STRONG");
    expect(result.newlyRecovered).toEqual(["revenue-growth"]);
  });
});
