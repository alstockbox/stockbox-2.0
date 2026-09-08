import { describe, expect, it } from "vitest";
import { comparePortfolioUpgradeEvidence } from "../../src/lib/portfolio/portfolio-ai-upgrade-evidence";
import type { PortfolioAiCandidate } from "../../src/lib/portfolio/portfolio-ai-planner";

const weak: PortfolioAiCandidate = {
  ticker: "WEAK",
  name: "Weak Holding",
  score: 52,
  recommendation: "Hold",
  valuation: 72,
  growth: 58,
  quality: 60,
  risk: 55,
  momentum: 70,
  analyzedAt: "2026-09-06T12:00:00.000Z",
};

const alternative: PortfolioAiCandidate = {
  ticker: "ALT",
  name: "Alternative",
  score: 82,
  recommendation: "Buy",
  valuation: 62,
  growth: 76,
  quality: 88,
  risk: 80,
  momentum: 64,
  analyzedAt: "2026-09-06T12:00:00.000Z",
};

describe("Portfolio AI upgrade tradeoffs V3", () => {
  it("separates profile-relevant strengths from real deteriorations", () => {
    const comparison = comparePortfolioUpgradeEvidence({
      weakCandidate: weak,
      upgradeCandidate: alternative,
      risk: "defensive",
      style: "quality",
      horizon: "long",
      strengthLimit: 3,
      tradeoffLimit: 2,
    });

    expect(comparison.strengths).toHaveLength(3);
    expect(comparison.strengths[0]?.dimension).toBe("quality");
    expect(comparison.strengths[0]?.delta).toBe(28);
    expect(comparison.strengths.some((item) => item.dimension === "risk")).toBe(true);

    expect(comparison.tradeoffs).toHaveLength(2);
    expect(comparison.tradeoffs.map((item) => item.dimension)).toEqual(["valuation", "momentum"]);
    expect(comparison.tradeoffs[0]?.delta).toBe(-10);
    expect(comparison.tradeoffs.every((item) => item.delta < 0)).toBe(true);
  });

  it("changes tradeoff priority with the selected profile instead of hiding disadvantages", () => {
    const comparison = comparePortfolioUpgradeEvidence({
      weakCandidate: weak,
      upgradeCandidate: alternative,
      risk: "aggressive",
      style: "growth",
      horizon: "short",
      strengthLimit: 2,
      tradeoffLimit: 2,
    });

    expect(comparison.strengths.map((item) => item.dimension)).toEqual(["growth", "quality"]);
    expect(comparison.tradeoffs[0]?.dimension).toBe("momentum");
    expect(comparison.tradeoffs[0]?.delta).toBe(-6);
  });

  it("only compares dimensions where both holdings have grounded numeric evidence", () => {
    const comparison = comparePortfolioUpgradeEvidence({
      weakCandidate: { ...weak, valuation: null, momentum: null },
      upgradeCandidate: alternative,
      risk: "balanced",
      style: "balanced",
      horizon: "long",
    });

    expect(comparison.tradeoffs).toEqual([]);
    expect(comparison.comparableDimensions).toBe(3);
    expect(comparison.strengths.every((item) => ["quality", "risk", "growth"].includes(item.dimension))).toBe(true);
  });
});
