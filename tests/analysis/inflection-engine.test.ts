import { describe, expect, it } from "vitest";
import { buildInflectionScore } from "@/lib/analysis/inflection-engine";
import type { AnalysisReport, ScoreDimension } from "@/lib/analysis/types";

function dimension(key: ScoreDimension["key"], score: number): ScoreDimension {
  return { key, label: key, score, weight: 1 };
}

function report(overrides: Partial<AnalysisReport> = {}): AnalysisReport {
  return {
    id: "test",
    ticker: "TEST",
    companyName: "Test AB",
    analysisType: "deep",
    investmentProfile: "balanced",
    generatedAt: "2026-09-02T08:00:00.000Z",
    oneSentence: "A test inflection report.",
    summary: "",
    recommendation: "Hold",
    shortTermAssessment: "",
    longTermAssessment: "",
    metrics: {
      revenueGrowth1y: 0.18,
      revenueCagr3y: 0.12,
      epsGrowth1y: 0.2,
      grossMargin: 0.48,
      operatingMargin: 0.18,
      netMargin: 0.12,
      fcf: 100,
      fcfMargin: 0.14,
      cashConversion: 0.9,
      debtToEquity: 0.2,
      debtToAssets: 0.15,
      netDebt: -50,
      interestCoverage: 12,
      earningsYield: 0.05,
      fcfYield: 0.045,
      priceMomentum1y: 0.25,
      priceMomentum3m: 0.12,
    },
    score: {
      score: 78,
      personalizedScore: 79,
      confidence: 88,
      missingData: [],
      dimensions: [
        dimension("growth", 82),
        dimension("financialHealth", 84),
        dimension("cashFlow", 78),
        dimension("momentum", 76),
      ],
    },
    dcf: { suitable: false, bear: null, base: null, bull: null },
    redFlags: [],
    greenFlags: [],
    scenarios: [],
    sources: [],
    disclaimer: "Test fixture only.",
    forwardEstimates: { nextYearRevenueGrowth: 0.22, nextYearEpsGrowth: 0.28 },
    providerDiagnostics: [{ provider: "twelve-data", capability: "estimates", status: "available", observedAt: "2026-09-02T08:00:00.000Z" }],
    ...overrides,
  };
}

describe("buildInflectionScore", () => {
  it("rewards broad fundamental, expectations and price confirmation", () => {
    const result = buildInflectionScore(report());
    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeGreaterThan(70);
    expect(result.blockers).toEqual([]);
    expect(result.coverage).toBeGreaterThan(0.8);
  });

  it("does not call momentum-only strength a high-conviction inflection", () => {
    const weak = report({
      metrics: { ...report().metrics, revenueGrowth1y: -0.08, operatingMargin: -0.04 },
      forwardEstimates: undefined,
      score: {
        ...report().score,
        dimensions: [dimension("growth", 25), dimension("financialHealth", 72), dimension("cashFlow", 60), dimension("momentum", 94)],
      },
    });
    const result = buildInflectionScore(weak);
    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeLessThanOrEqual(58);
    expect(result.blockers.some((item) => item.includes("Momentum"))).toBe(true);
  });

  it("caps apparent inflection when financial survival is weak", () => {
    const distressed = report({
      score: {
        ...report().score,
        dimensions: [dimension("growth", 90), dimension("financialHealth", 22), dimension("cashFlow", 35), dimension("momentum", 88)],
      },
    });
    const result = buildInflectionScore(distressed);
    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeLessThanOrEqual(52);
    expect(result.blockers.some((item) => item.includes("financial health"))).toBe(true);
  });

  it("counts missing forward estimates against planned coverage and confidence", () => {
    const complete = buildInflectionScore(report());
    const withoutEstimates = buildInflectionScore(report({ forwardEstimates: undefined, providerDiagnostics: [] }));

    expect(withoutEstimates.coverage).toBeLessThan(complete.coverage);
    expect(withoutEstimates.confidence).toBeLessThan(complete.confidence);
    expect(withoutEstimates.missingEvidence).toContain("forward-expectations");
  });
});
