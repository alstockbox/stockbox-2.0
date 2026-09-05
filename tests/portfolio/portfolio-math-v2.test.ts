import { describe, expect, it } from "vitest";
import {
  applyPortfolioWeights,
  buildPortfolioPositions,
  calculatePortfolioTotals,
  diversificationScore,
  valuePortfolioPosition,
  weightedAverage,
} from "@/lib/portfolio/portfolio-math";

describe("portfolio transaction math", () => {
  it("calculates weighted average cost across multiple purchases", () => {
    const [position] = buildPortfolioPositions([
      { id: "1", ticker: "INVE-B.ST", type: "buy", quantity: 10, price: 250, fees: 0, currency: "SEK", executedAt: "2026-01-10" },
      { id: "2", ticker: "INVE-B.ST", type: "buy", quantity: 5, price: 270, fees: 0, currency: "SEK", executedAt: "2026-03-15" },
    ]);
    expect(position.quantity).toBe(15);
    expect(position.costBasis).toBe(3850);
    expect(position.averagePurchasePrice).toBeCloseTo(256.6666667, 5);
    expect(position.firstPurchaseDate).toBe("2026-01-10");
  });

  it("includes buy fees in cost basis", () => {
    const [position] = buildPortfolioPositions([
      { ticker: "AAPL", type: "buy", quantity: 2, price: 100, fees: 10, currency: "USD", executedAt: "2026-01-01" },
    ]);
    expect(position.costBasis).toBe(210);
    expect(position.averagePurchasePrice).toBe(105);
  });

  it("reduces cost basis using moving-average cost when selling", () => {
    const [position] = buildPortfolioPositions([
      { id: "1", ticker: "AAPL", type: "buy", quantity: 10, price: 100, currency: "USD", executedAt: "2026-01-01" },
      { id: "2", ticker: "AAPL", type: "buy", quantity: 10, price: 200, currency: "USD", executedAt: "2026-02-01" },
      { id: "3", ticker: "AAPL", type: "sell", quantity: 5, price: 250, currency: "USD", executedAt: "2026-03-01" },
    ]);
    expect(position.quantity).toBe(15);
    expect(position.costBasis).toBe(2250);
    expect(position.averagePurchasePrice).toBe(150);
  });

  it("does not mix currencies when FX is missing", () => {
    const [position] = buildPortfolioPositions([
      { ticker: "AAPL", type: "buy", quantity: 2, price: 100, currency: "USD", executedAt: "2026-01-01" },
    ]);
    const valued = valuePortfolioPosition({ position, currentPrice: 120, marketCurrency: "USD", costFxToBase: null, marketFxToBase: null });
    expect(valued.valuationStatus).toBe("missing_fx");
    expect(valued.costBasisBase).toBeNull();
    expect(valued.marketValueBase).toBeNull();
  });

  it("calculates normalized totals and weights when data is complete", () => {
    const positions = buildPortfolioPositions([
      { ticker: "AAPL", type: "buy", quantity: 1, price: 100, currency: "USD", executedAt: "2026-01-01" },
      { ticker: "ERIC-B.ST", type: "buy", quantity: 10, price: 100, currency: "SEK", executedAt: "2026-01-01" },
    ]);
    const weighted = applyPortfolioWeights([
      valuePortfolioPosition({ position: positions[0], currentPrice: 120, marketCurrency: "USD", costFxToBase: 10, marketFxToBase: 10 }),
      valuePortfolioPosition({ position: positions[1], currentPrice: 110, marketCurrency: "SEK", costFxToBase: 1, marketFxToBase: 1 }),
    ]);
    expect(weighted[0].marketValueBase).toBe(1200);
    expect(weighted[1].marketValueBase).toBe(1100);
    expect(weighted[0].weight).toBeCloseTo(1200 / 2300, 8);
    const totals = calculatePortfolioTotals(weighted);
    expect(totals.complete).toBe(true);
    expect(totals.investedCapital).toBe(2000);
    expect(totals.marketValue).toBe(2300);
    expect(totals.unrealizedProfitLoss).toBe(300);
    expect(totals.unrealizedProfitLossPercent).toBe(15);
  });

  it("returns unavailable totals instead of mathematically wrong mixed-currency totals", () => {
    const [position] = buildPortfolioPositions([
      { ticker: "AAPL", type: "buy", quantity: 1, price: 100, currency: "USD", executedAt: "2026-01-01" },
    ]);
    const totals = calculatePortfolioTotals([
      valuePortfolioPosition({ position, currentPrice: 120, marketCurrency: "USD", costFxToBase: null, marketFxToBase: null }),
    ]);
    expect(totals.complete).toBe(false);
    expect(totals.marketValue).toBeNull();
  });

  it("uses weights instead of naive averaging", () => {
    expect(weightedAverage([{ value: 100, weight: 0.9 }, { value: 0, weight: 0.1 }])).toBe(90);
  });

  it("scores concentration from normalized weights", () => {
    expect(diversificationScore([0.5, 0.5])).toBeCloseTo(100, 8);
    expect(diversificationScore([0.99, 0.01])!).toBeLessThan(10);
    expect(diversificationScore([1])).toBe(0);
  });
});
