import { describe, expect, it } from "vitest";
import { computeMispricingAssessment, type MispricingInput } from "@/lib/analysis/mispricing";

const discountedQuality: MispricingInput = {
  currentPrice: 100,
  dcf: { suitable: true, bear: 95, base: 145, bull: 180, confidence: 90 },
  historicalPe: { current: 15, median: 24, sufficientHistory: true, observationCount: 48 },
  peerValuationScore: 78,
  valuationDimensionScore: 82,
  trends: {
    revenueGrowthCurrent: 0.18,
    revenueGrowthPrior: 0.14,
    epsGrowthCurrent: 0.22,
    epsGrowthPrior: 0.16,
    fcfMarginCurrent: 0.19,
    fcfMarginPrior: 0.17,
    operatingMarginCurrent: 0.23,
    operatingMarginPrior: 0.21,
    cashConversion: 1.05,
    debtToEquity: 0.35,
    interestCoverage: 18,
    shareGrowth: -0.01,
  },
  revisionNetLastMonth: 4,
  redFlags: [],
  sourceConflictSeverity: "none",
  dataStatus: "current",
  dataAsOf: "2026-08-31",
};

describe("computeMispricingAssessment", () => {
  it("identifies broad-based discount without confusing cheapness with quality", () => {
    const result = computeMispricingAssessment(discountedQuality);

    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeGreaterThanOrEqual(75);
    expect(["discounted", "deep_discount"]).toContain(result.label);
    expect(result.valueTrapRisk).toBe("low");
    expect(result.pillars.filter((pillar) => pillar.score !== null).length).toBeGreaterThanOrEqual(3);
    expect(result.positiveEvidence.length).toBeGreaterThan(0);
  });

  it("penalizes a superficially cheap but deteriorating value trap", () => {
    const result = computeMispricingAssessment({
      ...discountedQuality,
      trends: {
        revenueGrowthCurrent: -0.12,
        revenueGrowthPrior: 0.12,
        epsGrowthCurrent: -0.3,
        epsGrowthPrior: 0.1,
        fcfMarginCurrent: 0.02,
        fcfMarginPrior: 0.14,
        operatingMarginCurrent: 0.04,
        operatingMarginPrior: 0.16,
        cashConversion: 0.35,
        debtToEquity: 2.8,
        interestCoverage: 1.4,
        shareGrowth: 0.18,
      },
      revisionNetLastMonth: -8,
      redFlags: [{ severity: "high", title: "Funding stress" }],
    });

    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeLessThan(60);
    expect(result.valueTrapRisk).toBe("high");
    expect(result.counterEvidence.length).toBeGreaterThanOrEqual(4);
  });

  it("does not score unavailable DCF as zero", () => {
    const result = computeMispricingAssessment({
      ...discountedQuality,
      dcf: { suitable: false, bear: null, base: null, bull: null, confidence: 0 },
    });

    const intrinsic = result.pillars.find((pillar) => pillar.id === "intrinsic_value");
    expect(intrinsic?.score).toBeNull();
    expect(result.score).not.toBeNull();
    expect(result.coverage).toBeLessThan(1);
  });

  it("reduces confidence for stale and conflicted data without fabricating a bearish score", () => {
    const clean = computeMispricingAssessment(discountedQuality);
    const uncertain = computeMispricingAssessment({
      ...discountedQuality,
      sourceConflictSeverity: "high",
      dataStatus: "stale",
    });

    expect(uncertain.score).toBe(clean.score);
    expect(uncertain.confidence).toBeLessThan(clean.confidence);
    expect(uncertain.counterEvidence.some((item) => /conflict/i.test(item))).toBe(true);
    expect(uncertain.counterEvidence.some((item) => /stale/i.test(item))).toBe(true);
  });
});
