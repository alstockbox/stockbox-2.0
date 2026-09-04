import { describe, expect, it } from "vitest";
import { calculateGrowthScore, EARLY_GROWTH_WEIGHTS } from "@/lib/growth/growth-score";

describe("growth score", () => {
  it("weights qualified traffic and CTR strongly in sparse early-stage data", () => {
    const result = calculateGrowthScore({ qualifiedVisits: 90, ctr: 80, engagement: 40 }, EARLY_GROWTH_WEIGHTS);
    expect(result.score).toBeGreaterThan(70);
    expect(result.usedMetrics).toContain("qualifiedVisits");
    expect(result.usedMetrics).toContain("ctr");
  });

  it("improves when signup, activation and paid-intent signals improve", () => {
    const base = calculateGrowthScore({ qualifiedVisits: 60, ctr: 60, signupConversion: 30, activationConversion: 20, engagement: 50, costEfficiency: 80 }, EARLY_GROWTH_WEIGHTS);
    const better = calculateGrowthScore({ qualifiedVisits: 60, ctr: 60, signupConversion: 80, activationConversion: 80, engagement: 50, costEfficiency: 80 }, EARLY_GROWTH_WEIGHTS);
    expect(better.score).toBeGreaterThan(base.score);
  });

  it("renormalizes missing metrics instead of treating them as zero", () => {
    const sparse = calculateGrowthScore({ qualifiedVisits: 80, ctr: 80 }, EARLY_GROWTH_WEIGHTS);
    expect(sparse.score).toBe(80);
  });

  it("applies cost efficiency as a real penalty/reward dimension", () => {
    const efficient = calculateGrowthScore({ qualifiedVisits: 70, ctr: 70, signupConversion: 70, engagement: 70, activationConversion: 70, costEfficiency: 100 }, EARLY_GROWTH_WEIGHTS);
    const expensive = calculateGrowthScore({ qualifiedVisits: 70, ctr: 70, signupConversion: 70, engagement: 70, activationConversion: 70, costEfficiency: 0 }, EARLY_GROWTH_WEIGHTS);
    expect(efficient.score).toBeGreaterThan(expensive.score);
  });

  it("always clamps the score to 0-100", () => {
    expect(calculateGrowthScore({ qualifiedVisits: 999, ctr: -50 }, EARLY_GROWTH_WEIGHTS).score).toBeGreaterThanOrEqual(0);
    expect(calculateGrowthScore({ qualifiedVisits: 999, ctr: -50 }, EARLY_GROWTH_WEIGHTS).score).toBeLessThanOrEqual(100);
  });
});
