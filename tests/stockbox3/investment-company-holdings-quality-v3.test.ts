import { describe, expect, it } from "vitest";
import { analyzeInvestmentCompany, computeLookThroughMetrics } from "../../src/lib/analysis/universal-security";

describe("investment-company holdings-quality coverage V3", () => {
  it("fails closed when verified quality evidence covers less than 80% of portfolio weight", () => {
    const metrics = computeLookThroughMetrics([
      { name: "Verified holding", weight: 0.79, stockBoxScore: 92 },
      { name: "Unverified holding", weight: 0.21 },
    ]);

    expect(metrics.qualityCoveredWeight).toBeCloseTo(0.79, 10);
    expect(metrics.stockBoxQuality).toBeNull();

    const analysis = analyzeInvestmentCompany({
      sharePrice: 80,
      reportedNavPerShare: 100,
      holdings: [
        { name: "Verified holding", weight: 0.79, stockBoxScore: 92 },
        { name: "Unverified holding", weight: 0.21 },
      ],
    });
    const factor = analysis.score.factors.find((item) => item.key === "holdings_quality");
    expect(factor?.status).toBe("missing");
    expect(factor?.score).toBeNull();
  });

  it("accepts quality evidence at exactly 80% represented portfolio weight", () => {
    const metrics = computeLookThroughMetrics([
      { name: "Holding A", weight: 0.50, stockBoxScore: 80 },
      { name: "Holding B", weight: 0.30, stockBoxScore: 60 },
      { name: "Unverified", weight: 0.20 },
    ]);

    expect(metrics.qualityCoveredWeight).toBeCloseTo(0.80, 10);
    expect(metrics.stockBoxQuality).toBeCloseTo((80 * 0.50 + 60 * 0.30) / 0.80, 10);
  });

  it("can derive per-holding quality from at least two verified operating-quality fundamentals without fabricating a StockBox score", () => {
    const metrics = computeLookThroughMetrics([
      { name: "Holding A", weight: 0.50, roic: 0.18, epsGrowth: 0.12, operatingMargin: 0.20 },
      { name: "Holding B", weight: 0.30, roic: 0.10, revenueGrowth: 0.08, operatingMargin: 0.15 },
      { name: "Unverified", weight: 0.20 },
    ]);

    expect(metrics.qualityCoveredWeight).toBeCloseTo(0.80, 10);
    expect(metrics.stockBoxQuality).not.toBeNull();
    expect(metrics.stockBoxQuality).toBeGreaterThan(0);
    expect(metrics.stockBoxQuality).toBeLessThanOrEqual(100);
  });
});