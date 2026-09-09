import { describe, expect, it } from "vitest";
import {
  classifyPortfolioUpgradeNetCase,
  type PortfolioUpgradeEvidenceComparison,
} from "../../src/lib/portfolio/portfolio-ai-upgrade-evidence";

function evidence({
  strengths,
  tradeoffs,
  comparableDimensions = 5,
}: {
  strengths: Array<["quality" | "risk" | "growth" | "valuation" | "momentum", number, number]>;
  tradeoffs: Array<["quality" | "risk" | "growth" | "valuation" | "momentum", number, number]>;
  comparableDimensions?: number;
}): PortfolioUpgradeEvidenceComparison {
  return {
    comparableDimensions,
    strengths: strengths.map(([dimension, delta, relevanceWeight]) => ({ dimension, weakValue: 50, candidateValue: 50 + delta, delta, relevanceWeight })),
    tradeoffs: tradeoffs.map(([dimension, delta, relevanceWeight]) => ({ dimension, weakValue: 50, candidateValue: 50 + delta, delta, relevanceWeight })),
  };
}

describe("Portfolio AI upgrade net case V3", () => {
  it("labels a dominant evidence improvement as strong without forecasting returns", () => {
    const result = classifyPortfolioUpgradeNetCase(evidence({
      strengths: [["quality", 25, 2.5], ["risk", 18, 2.1], ["growth", 8, 1.3]],
      tradeoffs: [["valuation", -6, 1]],
    }));

    expect(result.label).toBe("strong_improvement");
    expect(result.positiveEvidence).toBeGreaterThan(result.negativeEvidence * 2);
    expect(result.netEvidence).toBeGreaterThan(0);
  });

  it("labels meaningful competing evidence as mixed", () => {
    const result = classifyPortfolioUpgradeNetCase(evidence({
      strengths: [["growth", 16, 2.8], ["quality", 8, 1]],
      tradeoffs: [["momentum", -12, 2.9], ["valuation", -9, 1.4]],
    }));

    expect(result.label).toBe("mixed");
    expect(result.positiveEvidence).toBeGreaterThan(0);
    expect(result.negativeEvidence).toBeGreaterThan(0);
  });

  it("labels a small positive edge as marginal and fails closed on sparse evidence", () => {
    const marginal = classifyPortfolioUpgradeNetCase(evidence({
      strengths: [["quality", 5, 1.2]],
      tradeoffs: [["valuation", -2, 1]],
      comparableDimensions: 3,
    }));
    expect(marginal.label).toBe("marginal");

    const insufficient = classifyPortfolioUpgradeNetCase(evidence({
      strengths: [["quality", 20, 2]],
      tradeoffs: [],
      comparableDimensions: 1,
    }));
    expect(insufficient.label).toBe("insufficient");
    expect(insufficient.netEvidence).toBeNull();
  });
});
