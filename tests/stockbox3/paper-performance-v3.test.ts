import { describe, expect, it } from "vitest";
import type { PaperFillV3, PaperMarketObservationV3, PaperTradingAccountStateV3 } from "@/lib/paper-trading/engine-v3";
import {
  derivePaperPerformanceV3,
  PAPER_TRADING_V3_FIXED_STARTING_CASH,
} from "@/lib/paper-trading/performance-v3";

const evaluatedAt = "2026-09-05T20:10:00.000Z";

function fill(overrides: Partial<PaperFillV3> = {}): PaperFillV3 {
  return {
    fillId: "fill-1",
    orderId: "order-1",
    idempotencyKey: "idem-1",
    ticker: "AAPL",
    side: "buy",
    quantity: 10,
    price: 100,
    grossAmount: 1000,
    fee: 0,
    currency: "USD",
    executedAt: "2026-09-05T20:00:05.000Z",
    marketObservedAt: "2026-09-05T20:00:00.000Z",
    provider: "yahoo-chart-execution",
    pricingBasis: "VERIFIED_OBSERVATION_EXACT",
    policyVersion: "stockbox-paper-trading-v3.0.0",
    ...overrides,
  };
}

function quote(overrides: Partial<PaperMarketObservationV3> = {}): PaperMarketObservationV3 {
  return {
    ticker: "AAPL",
    price: 110,
    currency: "USD",
    observedAt: "2026-09-05T20:09:00.000Z",
    provider: "yahoo-chart-execution",
    verification: "VERIFIED",
    ...overrides,
  };
}

function state(overrides: Partial<PaperTradingAccountStateV3> = {}): PaperTradingAccountStateV3 {
  return {
    cash: [{ currency: "USD", amount: 99_000 }],
    fills: [fill()],
    ...overrides,
  };
}

describe("Paper Trading V3 performance valuation", () => {
  it("marks a complete single-currency account to verified market", () => {
    const result = derivePaperPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state(),
      quotes: [quote()],
      evaluatedAt,
    });

    expect(result.status).toBe("VERIFIED");
    if (result.status !== "VERIFIED") return;
    expect(result.rankEligible).toBe(true);
    expect(result.cashValue).toBe(99_000);
    expect(result.positionsMarketValue).toBe(1_100);
    expect(result.equity).toBe(100_100);
    expect(result.profitLoss).toBe(100);
    expect(result.returnPercent).toBeCloseTo(0.1, 10);
    expect(result.pricingBasis).toBe("VERIFIED_MARK_TO_MARKET");
    expect(result.quoteCount).toBe(1);
  });

  it("values an all-cash account without inventing a market quote", () => {
    const result = derivePaperPerformanceV3({
      baseCurrency: "SEK",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: { cash: [{ currency: "SEK", amount: 100_000 }], fills: [] },
      quotes: [],
      evaluatedAt,
    });

    expect(result.status).toBe("VERIFIED");
    if (result.status !== "VERIFIED") return;
    expect(result.equity).toBe(100_000);
    expect(result.returnPercent).toBe(0);
    expect(result.quoteCount).toBe(0);
    expect(result.oldestQuoteObservedAt).toBeNull();
  });

  it("rejects any starting capital other than the fixed competition invariant", () => {
    const result = derivePaperPerformanceV3({
      baseCurrency: "USD",
      startingCash: 50_000,
      state: state(),
      quotes: [quote()],
      evaluatedAt,
    });
    expect(result).toMatchObject({ status: "UNAVAILABLE", rankEligible: false, reason: "INVALID_ACCOUNT" });
  });

  it("fails closed instead of mixing cash currencies", () => {
    const result = derivePaperPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state({ cash: [{ currency: "USD", amount: 98_000 }, { currency: "SEK", amount: 1_000 }] }),
      quotes: [quote()],
      evaluatedAt,
    });
    expect(result).toMatchObject({ status: "UNAVAILABLE", reason: "CASH_CURRENCY_MISMATCH" });
  });

  it("fails closed when historical positions contain another currency", () => {
    const result = derivePaperPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state({
        cash: [{ currency: "USD", amount: 99_000 }],
        fills: [fill({ currency: "EUR" })],
      }),
      quotes: [quote({ currency: "EUR" })],
      evaluatedAt,
    });
    expect(result).toMatchObject({ status: "UNAVAILABLE", reason: "POSITION_CURRENCY_MISMATCH" });
  });

  it("does not publish partial performance when a quote is missing", () => {
    const result = derivePaperPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state(),
      quotes: [],
      evaluatedAt,
    });
    expect(result).toMatchObject({ status: "UNAVAILABLE", rankEligible: false, reason: "QUOTE_MISSING" });
  });

  it("rejects duplicate quote candidates rather than choosing one arbitrarily", () => {
    const result = derivePaperPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state(),
      quotes: [quote(), quote({ price: 111 })],
      evaluatedAt,
    });
    expect(result).toMatchObject({ status: "UNAVAILABLE", reason: "QUOTE_CONFLICT" });
  });

  it("rejects unverified, stale, future and wrong-currency quotes", () => {
    const variants: Array<[Partial<PaperMarketObservationV3>, string]> = [
      [{ verification: "UNVERIFIED" }, "QUOTE_NOT_VERIFIED"],
      [{ observedAt: "2026-09-05T19:00:00.000Z" }, "QUOTE_STALE"],
      [{ observedAt: "2026-09-05T20:11:00.000Z" }, "QUOTE_FUTURE"],
      [{ currency: "EUR" }, "QUOTE_CURRENCY_MISMATCH"],
    ];

    for (const [overrides, reason] of variants) {
      const result = derivePaperPerformanceV3({
        baseCurrency: "USD",
        startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
        state: state(),
        quotes: [quote(overrides)],
        evaluatedAt,
      });
      expect(result).toMatchObject({ status: "UNAVAILABLE", rankEligible: false, reason });
    }
  });

  it("fails closed on an invalid fill ledger", () => {
    const invalid = fill({ grossAmount: 999 });
    const result = derivePaperPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state({ fills: [invalid] }),
      quotes: [quote()],
      evaluatedAt,
    });
    expect(result).toMatchObject({ status: "UNAVAILABLE", reason: "LEDGER_INVALID" });
  });
});