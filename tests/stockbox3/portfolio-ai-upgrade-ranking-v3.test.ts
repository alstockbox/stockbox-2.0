import { describe, expect, it } from "vitest";
import {
  rankPortfolioUpgradeOptions,
  summarizePortfolioUpgradeEvidence,
  type PortfolioUpgradeEvidenceComparison,
} from "@/lib/portfolio/portfolio-ai-upgrade-evidence";

function evidence({
  strengths = [],
  tradeoffs = [],
  comparableDimensions = 5,
}: Partial<PortfolioUpgradeEvidenceComparison> = {}): PortfolioUpgradeEvidenceComparison {
  return {
    comparableDimensions,
    strengths,
    tradeoffs,
  };
}

describe("Portfolio AI upgrade ranking", () => {
  it("ranks net-case class first and profile fit second without treating score uplift as a forecast", () => {
    const ranked = rankPortfolioUpgradeOptions([
      {
        ticker: "MIXED",
        profileRank: 1,
        scoreImprovement: 20,
        netCase: { label: "mixed", positiveEvidence: 45, negativeEvidence: 25, netEvidence: 20, comparableDimensions: 5 },
      },
      {
        ticker: "STRONG-B",
        profileRank: 2,
        scoreImprovement: 9,
        netCase: { label: "strong_improvement", positiveEvidence: 50, negativeEvidence: 10, netEvidence: 40, comparableDimensions: 5 },
      },
      {
        ticker: "STRONG-A",
        profileRank: 1,
        scoreImprovement: 8,
        netCase: { label: "strong_improvement", positiveEvidence: 35, negativeEvidence: 5, netEvidence: 30, comparableDimensions: 4 },
      },
      {
        ticker: "UNKNOWN",
        profileRank: 1,
        scoreImprovement: 30,
        netCase: { label: "insufficient", positiveEvidence: 30, negativeEvidence: 0, netEvidence: null, comparableDimensions: 1 },
      },
    ]);

    expect(ranked.map((item) => item.ticker)).toEqual(["STRONG-A", "STRONG-B", "MIXED", "UNKNOWN"]);
  });

  it("uses deterministic evidence strength as a tie-breaker after equal profile fit", () => {
    const ranked = rankPortfolioUpgradeOptions([
      {
        ticker: "B",
        profileRank: 1,
        scoreImprovement: 12,
        netCase: { label: "strong_improvement", positiveEvidence: 35, negativeEvidence: 10, netEvidence: 25, comparableDimensions: 5 },
      },
      {
        ticker: "A",
        profileRank: 1,
        scoreImprovement: 9,
        netCase: { label: "strong_improvement", positiveEvidence: 45, negativeEvidence: 5, netEvidence: 40, comparableDimensions: 5 },
      },
    ]);

    expect(ranked.map((item) => item.ticker)).toEqual(["A", "B"]);
  });

  it("summarizes the strongest verified upside and downside and stays fail-closed on missing evidence", () => {
    const comparison = evidence({
      strengths: [
        { dimension: "quality", weakValue: 55, candidateValue: 80, delta: 25, relevanceWeight: 2.9 },
        { dimension: "growth", weakValue: 60, candidateValue: 72, delta: 12, relevanceWeight: 1 },
      ],
      tradeoffs: [
        { dimension: "valuation", weakValue: 70, candidateValue: 61, delta: -9, relevanceWeight: 1 },
      ],
    });

    expect(summarizePortfolioUpgradeEvidence(comparison)).toEqual({
      primaryStrength: comparison.strengths[0],
      primaryTradeoff: comparison.tradeoffs[0],
    });
    expect(summarizePortfolioUpgradeEvidence(evidence({ strengths: [], tradeoffs: [], comparableDimensions: 1 }))).toEqual({
      primaryStrength: null,
      primaryTradeoff: null,
    });
  });
});
