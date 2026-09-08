import { describe, expect, it } from "vitest";
import {
  assessPortfolioDataQuality,
  buildPortfolioActionPlan,
  buildRebalancePlan,
  comparePortfolioSnapshots,
  createPortfolioPlan,
  findPortfolioUpgradeCandidates,
  type PortfolioAiCandidate,
} from "../../src/lib/portfolio/portfolio-ai-planner";

function candidates(count: number, analyzedAt = "2026-09-01T12:00:00.000Z"): PortfolioAiCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    ticker: `TEST${index + 1}`,
    name: `Test ${index + 1}`,
    score: 82 - index,
    recommendation: index < 3 ? "Buy" : "Hold",
    valuation: 68 + (index % 4),
    growth: 72 - (index % 5),
    quality: 84 - (index % 3),
    risk: 76 - (index % 4),
    momentum: 65 + (index % 6),
    analyzedAt,
  }));
}

describe("Portfolio AI planner V3", () => {
  it("reserves cash and converts target weights into a budget-aware portfolio draft", () => {
    const plan = createPortfolioPlan({
      candidates: candidates(12),
      budget: 10_000,
      cashReservePercent: 10,
      risk: "balanced",
      horizon: "long",
      style: "quality",
      breadth: "balanced",
      now: "2026-09-07T12:00:00.000Z",
    });

    expect(plan.cashReserveAmount).toBeCloseTo(1_000, 6);
    expect(plan.investableAmount).toBeCloseTo(9_000, 6);
    expect(plan.allocation.reduce((sum, item) => sum + item.targetAmount, 0)).toBeCloseTo(9_000, 6);
    expect(plan.allocation.reduce((sum, item) => sum + item.targetPortfolioWeight, 0)).toBeCloseTo(0.9, 6);
    expect(plan.allocation.every((item) => item.targetPortfolioWeight <= plan.effectiveMaxPositionWeight + 1e-9)).toBe(true);
    expect(plan.dataQuality.status).toBe("good");
  });

  it("fails closed when there are too few qualifying analyses instead of pretending the requested cap is feasible", () => {
    const plan = createPortfolioPlan({
      candidates: candidates(3),
      budget: 5_000,
      cashReservePercent: 10,
      risk: "defensive",
      horizon: "long",
      style: "quality",
      breadth: "focused",
      now: "2026-09-07T12:00:00.000Z",
    });

    expect(plan.capRelaxed).toBe(true);
    expect(plan.dataQuality.status).toBe("insufficient");
    expect(plan.dataQuality.recommendedAdditionalAnalyses).toBeGreaterThan(0);
    expect(plan.allocation.reduce((sum, item) => sum + item.targetPortfolioWeight, 0)).toBeCloseTo(0.9, 6);
    expect(plan.effectiveMaxPositionWeight).toBeGreaterThan(plan.requestedMaxPositionWeight);
  });

  it("identifies stale analysis coverage and tells the UI how many fresh analyses are needed", () => {
    const quality = assessPortfolioDataQuality({
      candidates: [
        ...candidates(4, "2026-09-05T12:00:00.000Z"),
        ...candidates(4, "2026-06-01T12:00:00.000Z").map((item, index) => ({ ...item, ticker: `OLD${index + 1}` })),
      ],
      requiredCount: 8,
      now: "2026-09-07T12:00:00.000Z",
      staleAfterDays: 45,
    });

    expect(quality.status).toBe("stale");
    expect(quality.freshCount).toBe(4);
    expect(quality.staleTickers).toHaveLength(4);
    expect(quality.recommendedAdditionalAnalyses).toBe(4);
  });

  it("compares the two latest snapshots with directionally useful deltas", () => {
    const delta = comparePortfolioSnapshots(
      {
        portfolioScore: 74,
        riskScore: 69,
        diversificationScore: 71,
        unrealizedProfitLoss: 2_100,
        portfolioValue: 42_000,
        largestPositionWeight: 0.19,
      },
      {
        portfolioScore: 70,
        riskScore: 71,
        diversificationScore: 64,
        unrealizedProfitLoss: 1_400,
        portfolioValue: 39_500,
        largestPositionWeight: 0.25,
      },
    );

    expect(delta?.portfolioScore).toBe(4);
    expect(delta?.riskScore).toBe(-2);
    expect(delta?.diversificationScore).toBe(7);
    expect(delta?.unrealizedProfitLoss).toBe(700);
    expect(delta?.portfolioValue).toBe(2_500);
    expect(delta?.largestPositionWeight).toBeCloseTo(-0.06, 8);
  });

  it("produces target-vs-current rebalance deltas without creating trade instructions", () => {
    const rebalance = buildRebalancePlan(
      [
        { ticker: "AAA", currentWeight: 0.45 },
        { ticker: "BBB", currentWeight: 0.30 },
        { ticker: "CCC", currentWeight: 0.25 },
      ],
      [
        { ticker: "AAA", targetPortfolioWeight: 0.30 },
        { ticker: "BBB", targetPortfolioWeight: 0.35 },
        { ticker: "DDD", targetPortfolioWeight: 0.25 },
      ],
    );

    expect(rebalance.find((item) => item.ticker === "AAA")?.deltaWeight).toBeCloseTo(-0.15, 8);
    expect(rebalance.find((item) => item.ticker === "BBB")?.deltaWeight).toBeCloseTo(0.05, 8);
    expect(rebalance.find((item) => item.ticker === "CCC")?.deltaWeight).toBeCloseTo(-0.25, 8);
    expect(rebalance.find((item) => item.ticker === "DDD")?.deltaWeight).toBeCloseTo(0.25, 8);
    expect(rebalance.every((item) => !("order" in item))).toBe(true);
  });

  it("prioritizes negative signals and concentration while surfacing data-quality work", () => {
    const actions = buildPortfolioActionPlan({
      portfolioScore: 58,
      riskScore: 61,
      diversificationScore: 52,
      largestPosition: "AAA",
      largestPositionWeight: 0.27,
      requestedMaxPositionWeight: 0.15,
      holdings: [
        { ticker: "AAA", weight: 0.27, score: 66, recommendation: "Hold" },
        { ticker: "BBB", weight: 0.12, score: 43, recommendation: "Sell" },
      ],
      dataQuality: {
        status: "stale",
        totalQualifying: 8,
        freshCount: 4,
        staleTickers: ["AAA", "BBB", "CCC", "DDD"],
        recommendedAdditionalAnalyses: 4,
      },
      risk: "balanced",
    });

    expect(actions.length).toBeGreaterThanOrEqual(4);
    expect(actions[0]?.priority).toBe("high");
    expect(actions.some((action) => action.code === "negative_signal")).toBe(true);
    expect(actions.some((action) => action.code === "concentration")).toBe(true);
    expect(actions.some((action) => action.code === "stale_data")).toBe(true);
    expect(actions.some((action) => action.code === "weak_holding")).toBe(true);
  });

  it("suggests only fresh analyzed upgrades that materially outrank a weak holding and excludes current holdings", () => {
    const upgrades = findPortfolioUpgradeCandidates({
      weakHolding: { ticker: "WEAK", score: 48 },
      currentHoldingTickers: ["WEAK", "OWNED"],
      candidates: [
        {
          ticker: "BEST",
          name: "Best Candidate",
          score: 84,
          recommendation: "Buy",
          valuation: 72,
          growth: 80,
          quality: 88,
          risk: 74,
          momentum: 77,
          analyzedAt: "2026-09-06T12:00:00.000Z",
        },
        {
          ticker: "OWNED",
          name: "Already Owned",
          score: 90,
          recommendation: "Strong Buy",
          valuation: 80,
          growth: 85,
          quality: 91,
          risk: 79,
          momentum: 82,
          analyzedAt: "2026-09-06T12:00:00.000Z",
        },
        {
          ticker: "OLD",
          name: "Stale Candidate",
          score: 92,
          recommendation: "Strong Buy",
          valuation: 83,
          growth: 88,
          quality: 93,
          risk: 80,
          momentum: 90,
          analyzedAt: "2026-05-01T12:00:00.000Z",
        },
        {
          ticker: "SMALL",
          name: "Marginal Improvement",
          score: 51,
          recommendation: "Hold",
          valuation: 55,
          growth: 54,
          quality: 57,
          risk: 58,
          momentum: 52,
          analyzedAt: "2026-09-06T12:00:00.000Z",
        },
      ],
      risk: "balanced",
      style: "quality",
      horizon: "long",
      now: "2026-09-07T12:00:00.000Z",
      minimumScoreImprovement: 8,
      limit: 3,
    });

    expect(upgrades).toHaveLength(1);
    expect(upgrades[0]?.ticker).toBe("BEST");
    expect(upgrades[0]?.scoreImprovement).toBe(36);
    expect(upgrades[0]?.profileRank).toBeGreaterThan(0);
    expect(upgrades.every((item) => !["WEAK", "OWNED", "OLD", "SMALL"].includes(item.ticker) || item.ticker === "BEST")).toBe(true);
  });
});
