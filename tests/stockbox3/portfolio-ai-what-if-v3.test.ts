import { describe, expect, it } from "vitest";
import {
  simulatePortfolioWhatIf,
  type PortfolioAiCandidate,
} from "../../src/lib/portfolio/portfolio-ai-planner";

const analyzed: PortfolioAiCandidate[] = [
  { ticker: "AAA", name: "AAA", score: 52, recommendation: "Hold", valuation: 55, growth: 48, quality: 50, risk: 46, momentum: 44, analyzedAt: "2026-09-07T12:00:00.000Z" },
  { ticker: "BBB", name: "BBB", score: 60, recommendation: "Hold", valuation: 60, growth: 58, quality: 62, risk: 58, momentum: 54, analyzedAt: "2026-09-07T12:00:00.000Z" },
  { ticker: "CCC", name: "CCC", score: 84, recommendation: "Buy", valuation: 74, growth: 82, quality: 88, risk: 76, momentum: 79, analyzedAt: "2026-09-07T12:00:00.000Z" },
  { ticker: "DDD", name: "DDD", score: 80, recommendation: "Buy", valuation: 72, growth: 77, quality: 85, risk: 79, momentum: 73, analyzedAt: "2026-09-07T12:00:00.000Z" },
];

describe("Portfolio AI what-if simulation V3", () => {
  it("compares current and target structure without creating trading instructions", () => {
    const result = simulatePortfolioWhatIf({
      current: [
        { ticker: "AAA", weight: 0.55 },
        { ticker: "BBB", weight: 0.35 },
      ],
      target: [
        { ticker: "AAA", targetPortfolioWeight: 0.20 },
        { ticker: "BBB", targetPortfolioWeight: 0.20 },
        { ticker: "CCC", targetPortfolioWeight: 0.25 },
        { ticker: "DDD", targetPortfolioWeight: 0.25 },
      ],
      candidates: analyzed,
      minimumCoverage: 0.8,
    });

    expect(result.status).toBe("good");
    expect(result.current.largestPositionWeight).toBeCloseTo(0.55, 8);
    expect(result.target.largestPositionWeight).toBeCloseTo(0.25, 8);
    expect(result.delta.largestPositionWeight).toBeCloseTo(-0.30, 8);
    expect(result.target.weightDiversificationScore).toBeGreaterThan(result.current.weightDiversificationScore);
    expect(result.target.weightedScore).toBeGreaterThan(result.current.weightedScore ?? 0);
    expect(result.target.weightedRisk).toBeGreaterThan(result.current.weightedRisk ?? 0);
    expect(result.delta.weightedScore).toBeGreaterThan(0);
    expect(result.delta.weightedRisk).toBeGreaterThan(0);
    expect("order" in result).toBe(false);
    expect("trade" in result).toBe(false);
  });

  it("fails closed on StockBox signal deltas when analyzed coverage is insufficient while keeping structural metrics", () => {
    const result = simulatePortfolioWhatIf({
      current: [
        { ticker: "AAA", weight: 0.50 },
        { ticker: "MISSING", weight: 0.40 },
      ],
      target: [
        { ticker: "CCC", targetPortfolioWeight: 0.45 },
        { ticker: "UNKNOWN", targetPortfolioWeight: 0.45 },
      ],
      candidates: analyzed,
      minimumCoverage: 0.8,
    });

    expect(result.status).toBe("insufficient");
    expect(result.current.analysisCoverage).toBeLessThan(0.8);
    expect(result.target.analysisCoverage).toBeLessThan(0.8);
    expect(result.current.weightedScore).toBeNull();
    expect(result.target.weightedScore).toBeNull();
    expect(result.delta.weightedScore).toBeNull();
    expect(result.current.largestPositionWeight).toBeCloseTo(0.50, 8);
    expect(result.target.largestPositionWeight).toBeCloseTo(0.45, 8);
  });
});
