import { describe, expect, it } from "vitest";
import type { PaperFillV3, PaperMarketObservationV3, PaperTradingAccountStateV3 } from "@/lib/paper-trading/engine-v3";
import {
  derivePaperFinalPerformanceV3,
  derivePaperPerformanceV3,
  PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS,
  PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION,
  PAPER_TRADING_V3_FIXED_STARTING_CASH,
} from "@/lib/paper-trading/performance-v3";
import { parseYahooFinalCutoffQuoteV3 } from "@/lib/paper-trading/final-cutoff-quote-v3";

const CUTOFF = "2026-09-06T20:00:00.000Z";
const cutoffMs = Date.parse(CUTOFF);
const second = (ms: number) => Math.floor(ms / 1000);

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
    executedAt: "2026-09-01T14:30:05.000Z",
    marketObservedAt: "2026-09-01T14:30:00.000Z",
    provider: "yahoo-chart-execution",
    pricingBasis: "VERIFIED_OBSERVATION_EXACT",
    policyVersion: "stockbox-paper-trading-v3.0.0",
    ...overrides,
  };
}

function state(): PaperTradingAccountStateV3 {
  return {
    cash: [{ currency: "USD", amount: 99_000 }],
    fills: [fill()],
  };
}

function quote(observedAt: string, overrides: Partial<PaperMarketObservationV3> = {}): PaperMarketObservationV3 {
  return {
    ticker: "AAPL",
    price: 110,
    currency: "USD",
    observedAt,
    provider: "yahoo-chart-final-cutoff",
    verification: "VERIFIED",
    ...overrides,
  };
}

function payload(observedAtMs: number, price = 110) {
  return {
    chart: {
      result: [{
        meta: { currency: "USD" },
        timestamp: [second(observedAtMs)],
        indicators: { quote: [{ close: [price] }] },
      }],
      error: null,
    },
  };
}

describe("Paper Trading V3 final performance policy", () => {
  it("keeps active valuation on the existing fresh-market policy", () => {
    const observedAt = new Date(cutoffMs - 3 * 24 * 60 * 60_000).toISOString();
    const result = derivePaperPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state(),
      quotes: [quote(observedAt)],
      evaluatedAt: CUTOFF,
    });

    expect(result).toMatchObject({ status: "UNAVAILABLE", reason: "QUOTE_STALE" });
  });

  it("values a completed competition from a verified pre-cutoff market observation within seven days", () => {
    expect(PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS).toBe(7 * 24 * 60 * 60_000);
    expect(PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION).toBe("stockbox-paper-final-performance-v3.0.0");

    const observedAt = new Date(cutoffMs - 3 * 24 * 60 * 60_000).toISOString();
    const result = derivePaperFinalPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state(),
      quotes: [quote(observedAt)],
      evaluatedAt: CUTOFF,
    });

    expect(result.status).toBe("VERIFIED");
    if (result.status !== "VERIFIED") return;
    expect(result.rankEligible).toBe(true);
    expect(result.policyVersion).toBe(PAPER_FINAL_PERFORMANCE_V3_POLICY_VERSION);
    expect(result.pricingBasis).toBe("VERIFIED_LAST_TRADE_AT_OR_BEFORE_CUTOFF");
    expect(result.oldestQuoteObservedAt).toBe(observedAt);
    expect(result.equity).toBe(100_100);
  });

  it("still fails closed for observations older than the bounded final lookback", () => {
    const observedAt = new Date(cutoffMs - PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS - 1_000).toISOString();
    const result = derivePaperFinalPerformanceV3({
      baseCurrency: "USD",
      startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
      state: state(),
      quotes: [quote(observedAt)],
      evaluatedAt: CUTOFF,
    });

    expect(result).toMatchObject({ status: "UNAVAILABLE", reason: "QUOTE_STALE" });
  });

  it("preserves the normal verification, currency and future-time guards in final mode", () => {
    const observedAt = new Date(cutoffMs - 24 * 60 * 60_000).toISOString();
    const variants: Array<[Partial<PaperMarketObservationV3>, string]> = [
      [{ verification: "UNVERIFIED" }, "QUOTE_NOT_VERIFIED"],
      [{ currency: "EUR" }, "QUOTE_CURRENCY_MISMATCH"],
      [{ observedAt: new Date(cutoffMs + 60_000).toISOString() }, "QUOTE_FUTURE"],
    ];

    for (const [overrides, reason] of variants) {
      const result = derivePaperFinalPerformanceV3({
        baseCurrency: "USD",
        startingCash: PAPER_TRADING_V3_FIXED_STARTING_CASH,
        state: state(),
        quotes: [quote(observedAt, overrides)],
        evaluatedAt: CUTOFF,
      });
      expect(result).toMatchObject({ status: "UNAVAILABLE", reason });
    }
  });

  it("allows the final Yahoo parser to select the latest genuine pre-cutoff bar beyond the active 20-minute window", () => {
    const observedAtMs = cutoffMs - 3 * 24 * 60 * 60_000;
    const result = parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload(observedAtMs));

    expect(result.reason).toBeNull();
    expect(result.observation).toMatchObject({
      ticker: "AAPL",
      price: 110,
      currency: "USD",
      observedAt: new Date(observedAtMs).toISOString(),
      verification: "VERIFIED",
    });
  });

  it("keeps the final Yahoo parser bounded to the explicit seven-day policy", () => {
    const observedAtMs = cutoffMs - PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS - 1_000;
    const result = parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload(observedAtMs));

    expect(result.reason).toBe("no_fresh_final_bar");
    expect(result.observation.verification).toBe("UNAVAILABLE");
  });
});
