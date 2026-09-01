import { describe, expect, it } from "vitest";
import { computeInflectionAssessment, type InflectionInput } from "@/lib/analysis/inflection";

const earlyInflection: InflectionInput = {
  fundamentals: {
    revenueGrowthCurrent: 0.24,
    revenueGrowthPrior: 0.11,
    epsGrowthCurrent: 0.31,
    epsGrowthPrior: 0.09,
    fcfMarginCurrent: 0.16,
    fcfMarginPrior: 0.1,
    operatingMarginCurrent: 0.19,
    operatingMarginPrior: 0.14,
    roicCurrent: 0.18,
    roicPrior: 0.13,
  },
  expectations: {
    revisionNetLastWeek: 3,
    revisionNetLastMonth: 7,
    nextYearRevenueGrowth: 0.19,
    nextYearEpsGrowth: 0.25,
  },
  market: {
    oneMonth: 0.07,
    threeMonth: 0.16,
    sixMonth: 0.22,
    oneYear: 0.28,
    price: 92,
    yearHigh: 110,
    yearLow: 55,
  },
  funding: {
    financialHealthScore: 82,
    shareGrowth: 0.01,
    interestCoverage: 11,
    criticalRisk: false,
  },
  research: { positiveCatalysts: 2, negativeCatalysts: 0 },
  dataAsOf: "2026-08-31",
};

describe("computeInflectionAssessment", () => {
  it("rewards multi-factor early inflection with independent confirmation", () => {
    const result = computeInflectionAssessment(earlyInflection);

    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeGreaterThan(80);
    expect(result.stage).toBe("confirming");
    expect(result.availableFamilies.length).toBeGreaterThanOrEqual(3);
    expect(result.accelerators.length).toBeGreaterThanOrEqual(3);
    expect(result.overextensionRisk).toBe("low");
  });

  it("does not call momentum alone a high-conviction inflection", () => {
    const result = computeInflectionAssessment({
      fundamentals: null,
      expectations: null,
      market: { oneMonth: 0.18, threeMonth: 0.42, sixMonth: 0.55, oneYear: 0.7, price: 99, yearHigh: 100, yearLow: 40 },
      funding: { financialHealthScore: 62, shareGrowth: null, interestCoverage: null, criticalRisk: false },
      research: null,
    });

    expect(result.score === null || result.score <= 70).toBe(true);
    expect(result.stage).not.toBe("confirming");
  });

  it("keeps fundamental acceleration in building stage without market confirmation", () => {
    const result = computeInflectionAssessment({
      ...earlyInflection,
      market: { oneMonth: -0.03, threeMonth: -0.07, sixMonth: -0.04, oneYear: 0.01, price: 65, yearHigh: 110, yearLow: 55 },
    });

    expect(result.score).not.toBeNull();
    expect(result.stage).toBe("building");
    expect(result.brakes.some((item) => /market/i.test(item))).toBe(true);
  });

  it("caps a fragile setup despite strong growth and momentum", () => {
    const result = computeInflectionAssessment({
      ...earlyInflection,
      funding: { financialHealthScore: 22, shareGrowth: 0.2, interestCoverage: 0.9, criticalRisk: true },
    });

    expect(result.stage).toBe("fragile");
    expect(result.score).not.toBeNull();
    expect(result.score as number).toBeLessThanOrEqual(35);
    expect(result.brakes.some((item) => /critical/i.test(item))).toBe(true);
  });

  it("penalizes dilution even when other signals are constructive", () => {
    const clean = computeInflectionAssessment(earlyInflection);
    const diluted = computeInflectionAssessment({
      ...earlyInflection,
      funding: { ...earlyInflection.funding!, shareGrowth: 0.16 },
    });

    expect(diluted.score).not.toBeNull();
    expect(clean.score).not.toBeNull();
    expect(diluted.score as number).toBeLessThan(clean.score as number);
    expect(diluted.brakes.some((item) => /dilution/i.test(item))).toBe(true);
  });

  it("treats missing estimates as lower coverage rather than negative revisions", () => {
    const withEstimates = computeInflectionAssessment(earlyInflection);
    const withoutEstimates = computeInflectionAssessment({ ...earlyInflection, expectations: null });

    expect(withoutEstimates.coverage).toBeLessThan(withEstimates.coverage);
    expect(withoutEstimates.signals.find((signal) => signal.id === "expectations")?.score).toBeNull();
    expect(withoutEstimates.brakes.some((item) => /negative revisions/i.test(item))).toBe(false);
  });

  it("marks parabolic price action as extended instead of blindly increasing conviction", () => {
    const result = computeInflectionAssessment({
      ...earlyInflection,
      market: { oneMonth: 0.38, threeMonth: 0.78, sixMonth: 1.1, oneYear: 1.45, price: 119, yearHigh: 120, yearLow: 44 },
    });

    expect(result.stage).toBe("extended");
    expect(result.overextensionRisk).toBe("high");
    expect(result.brakes.some((item) => /overextended/i.test(item))).toBe(true);
  });
});
