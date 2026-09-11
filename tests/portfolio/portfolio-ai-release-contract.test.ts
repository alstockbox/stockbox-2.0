import { describe, expect, it } from "vitest";
import {
  createPortfolioPlan,
  simulatePortfolioWhatIf,
  type PortfolioAiCandidate,
} from "../../src/lib/portfolio/portfolio-ai-planner";
import {
  classifyPortfolioUpgradeNetCase,
  comparePortfolioUpgradeEvidence,
  rankPortfolioUpgradeOptions,
  summarizePortfolioUpgradeEvidence,
} from "../../src/lib/portfolio/portfolio-ai-upgrade-evidence";

function candidate(
  ticker: string,
  score: number,
  overrides: Partial<PortfolioAiCandidate> = {},
): PortfolioAiCandidate {
  return {
    ticker,
    name: ticker,
    score,
    recommendation: "Buy",
    valuation: 70,
    growth: 70,
    quality: 70,
    risk: 70,
    momentum: 70,
    analyzedAt: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("Portfolio AI release contract", () => {
  it("keeps allocation budget-aware and preserves an explicit cash reserve", () => {
    const candidates = Array.from({ length: 12 }, (_, index) => candidate(`C${index + 1}`, 90 - index));
    const plan = createPortfolioPlan({
      candidates,
      budget: 10_000,
      cashReservePercent: 10,
      risk: "balanced",
      horizon: "long",
      style: "quality",
      breadth: "balanced",
      now: "2026-09-10T18:00:00.000Z",
    });

    expect(plan.cashReserveAmount).toBeCloseTo(1_000, 6);
    expect(plan.investableAmount).toBeCloseTo(9_000, 6);
    expect(plan.allocation.reduce((sum, item) => sum + item.targetAmount, 0)).toBeCloseTo(9_000, 6);
    expect(plan.allocation.reduce((sum, item) => sum + item.targetPortfolioWeight, 0)).toBeCloseTo(0.9, 6);
  });

  it("fails closed in what-if when current or target analysis coverage is insufficient", () => {
    const result = simulatePortfolioWhatIf({
      current: [
        { ticker: "KNOWN", weight: 0.5 },
        { ticker: "MISSING", weight: 0.5 },
      ],
      target: [
        { ticker: "KNOWN", targetPortfolioWeight: 0.5 },
        { ticker: "MISSING", targetPortfolioWeight: 0.4 },
      ],
      candidates: [candidate("KNOWN", 80, { quality: 82, growth: 78, valuation: 72, risk: 76 })],
      minimumCoverage: 0.8,
    });

    expect(result.status).toBe("insufficient");
    expect(result.current.weightedScore).toBeNull();
    expect(result.target.weightedScore).toBeNull();
    expect(result.current.weightDiversificationScore).toBeGreaterThanOrEqual(0);
    expect(result.target.largestPositionWeight).toBeGreaterThan(0);
  });

  it("ranks grounded upgrade cases by net-case class before profile rank", () => {
    const ranked = rankPortfolioUpgradeOptions([
      {
        ticker: "MIXED",
        profileRank: 1,
        scoreImprovement: 30,
        netCase: { label: "mixed" as const, positiveEvidence: 30, negativeEvidence: 12, netEvidence: 18, comparableDimensions: 5 },
      },
      {
        ticker: "STRONG",
        profileRank: 50,
        scoreImprovement: 12,
        netCase: { label: "strong_improvement" as const, positiveEvidence: 40, negativeEvidence: 5, netEvidence: 35, comparableDimensions: 5 },
      },
      {
        ticker: "UNKNOWN",
        profileRank: 0,
        scoreImprovement: 50,
        netCase: { label: "insufficient" as const, positiveEvidence: 0, negativeEvidence: 0, netEvidence: null, comparableDimensions: 1 },
      },
    ]);

    expect(ranked.map((item) => item.ticker)).toEqual(["STRONG", "MIXED", "UNKNOWN"]);
  });

  it("uses comparable evidence only and suppresses concise summaries when evidence is insufficient", () => {
    const weak = candidate("WEAK", 50, { quality: 55, growth: null, valuation: null, risk: null, momentum: null });
    const upgrade = candidate("UP", 75, { quality: 85, growth: null, valuation: null, risk: null, momentum: null });
    const comparison = comparePortfolioUpgradeEvidence({
      weakCandidate: weak,
      upgradeCandidate: upgrade,
      risk: "balanced",
      style: "quality",
      horizon: "long",
    });
    const netCase = classifyPortfolioUpgradeNetCase(comparison);
    const summary = summarizePortfolioUpgradeEvidence(comparison);

    expect(comparison.comparableDimensions).toBe(1);
    expect(netCase.label).toBe("insufficient");
    expect(netCase.netEvidence).toBeNull();
    expect(summary.primaryStrength).toBeNull();
    expect(summary.primaryTradeoff).toBeNull();
  });
});
