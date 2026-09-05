import { describe, expect, it } from "vitest";
import { calculateRealizedPortfolioPerformance, type PortfolioTransactionInput } from "@/lib/portfolio/portfolio-math";

function tx(overrides: Partial<PortfolioTransactionInput> = {}): PortfolioTransactionInput {
  return {
    id: "t1",
    ticker: "AAPL",
    type: "buy",
    quantity: 10,
    price: 100,
    fees: 0,
    currency: "USD",
    executedAt: "2026-01-01",
    ...overrides,
  };
}

describe("Portfolio V3 realized P/L", () => {
  it("uses average cost basis and subtracts sell fees", () => {
    const result = calculateRealizedPortfolioPerformance([
      tx({ id: "b1", quantity: 10, price: 100, fees: 10 }),
      tx({ id: "b2", quantity: 10, price: 200, fees: 10, executedAt: "2026-02-01" }),
      tx({ id: "s1", type: "sell", quantity: 5, price: 250, fees: 5, executedAt: "2026-03-01" }),
    ]);

    expect(result.complete).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.byCurrency).toHaveLength(1);
    expect(result.byCurrency[0]?.currency).toBe("USD");
    expect(result.byCurrency[0]?.grossProceeds).toBeCloseTo(1250);
    expect(result.byCurrency[0]?.costBasisSold).toBeCloseTo(755);
    expect(result.byCurrency[0]?.sellFees).toBeCloseTo(5);
    expect(result.byCurrency[0]?.realizedProfitLoss).toBeCloseTo(490);
  });

  it("keeps currencies separate rather than inventing an FX conversion", () => {
    const result = calculateRealizedPortfolioPerformance([
      tx({ id: "u1", ticker: "AAPL", currency: "USD", quantity: 1, price: 100 }),
      tx({ id: "u2", ticker: "AAPL", currency: "USD", type: "sell", quantity: 1, price: 110, executedAt: "2026-02-01" }),
      tx({ id: "s1", ticker: "ERIC-B.ST", currency: "SEK", quantity: 2, price: 80 }),
      tx({ id: "s2", ticker: "ERIC-B.ST", currency: "SEK", type: "sell", quantity: 2, price: 90, executedAt: "2026-02-01" }),
    ]);

    expect(result.complete).toBe(true);
    expect(result.byCurrency.map((item) => item.currency)).toEqual(["SEK", "USD"]);
    expect(result.byCurrency.find((item) => item.currency === "USD")?.realizedProfitLoss).toBeCloseTo(10);
    expect(result.byCurrency.find((item) => item.currency === "SEK")?.realizedProfitLoss).toBeCloseTo(20);
  });

  it("fails closed and suppresses monetary aggregates on an oversell", () => {
    const result = calculateRealizedPortfolioPerformance([
      tx({ id: "b1", quantity: 3, price: 100 }),
      tx({ id: "s1", type: "sell", quantity: 4, price: 120, executedAt: "2026-02-01" }),
    ]);

    expect(result.complete).toBe(false);
    expect(result.byCurrency).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "SELL_EXCEEDS_POSITION",
        transactionId: "s1",
        requestedQuantity: 4,
        availableQuantity: 3,
      }),
    ]);
  });

  it("fails closed when an invalid historical buy could corrupt later cost basis", () => {
    const result = calculateRealizedPortfolioPerformance([
      tx({ id: "bad-buy", quantity: 0, price: 100 }),
      tx({ id: "sell", type: "sell", quantity: 1, price: 120, executedAt: "2026-02-01" }),
    ]);

    expect(result.complete).toBe(false);
    expect(result.byCurrency).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual(["INVALID_BUY", "SELL_EXCEEDS_POSITION"]);
  });

  it("handles a full exit without creating a synthetic remaining position", () => {
    const result = calculateRealizedPortfolioPerformance([
      tx({ id: "buy", quantity: 2, price: 50, fees: 2 }),
      tx({ id: "sell", type: "sell", quantity: 2, price: 70, fees: 2, executedAt: "2026-02-01" }),
    ]);

    expect(result.complete).toBe(true);
    expect(result.byCurrency[0]?.realizedProfitLoss).toBeCloseTo(36);
    expect(result.byCurrency[0]?.sales).toBe(1);
  });
});
