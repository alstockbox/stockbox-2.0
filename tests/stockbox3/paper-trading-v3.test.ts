import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  derivePaperTradingLedgerV3,
  executePaperMarketOrderV3,
  PAPER_TRADING_V3_POLICY_VERSION,
  type PaperFillV3,
  type PaperMarketObservationV3,
  type PaperTradingAccountStateV3,
  type TrustedPaperOrderEnvelopeV3,
} from "@/lib/paper-trading/engine-v3";

const source = readFileSync("src/lib/paper-trading/engine-v3.ts", "utf8");

function trusted(orderId = "order-1", fillId = "fill-1", serverReceivedAt = "2026-09-05T12:10:00.000Z"): TrustedPaperOrderEnvelopeV3 {
  return { orderId, fillId, serverReceivedAt };
}

function market(overrides: Partial<PaperMarketObservationV3> = {}): PaperMarketObservationV3 {
  return {
    ticker: "AAPL",
    price: 100,
    currency: "USD",
    observedAt: "2026-09-05T12:09:30.000Z",
    provider: "verified-market-provider",
    verification: "VERIFIED",
    ...overrides,
  };
}

function emptyState(cash: PaperTradingAccountStateV3["cash"] = [{ currency: "USD", amount: 1000 }]): PaperTradingAccountStateV3 {
  return { cash, fills: [] };
}

describe("Paper Trading V3", () => {
  it("fills a market buy at the exact verified observation and deducts same-currency cash", () => {
    const result = executePaperMarketOrderV3({
      intent: { idempotencyKey: "idem-buy-1", ticker: "aapl", side: "buy", quantity: 2 },
      trusted: trusted(),
      market: market(),
      state: emptyState(),
    });

    expect(result.status).toBe("FILLED");
    if (result.status !== "FILLED") return;
    expect(result.fill).toMatchObject({
      ticker: "AAPL",
      side: "buy",
      quantity: 2,
      price: 100,
      grossAmount: 200,
      fee: 0,
      currency: "USD",
      provider: "verified-market-provider",
      pricingBasis: "VERIFIED_OBSERVATION_EXACT",
      policyVersion: PAPER_TRADING_V3_POLICY_VERSION,
    });
    expect(result.nextState.cash).toEqual([{ currency: "USD", amount: 800 }]);
    expect(result.positionAfter).toMatchObject({ quantity: 2, averageCost: 100, costBasis: 200, realizedProfitLoss: 0 });
  });

  it("rejects unverified, conflicted, stale and future market observations", () => {
    const base = {
      intent: { idempotencyKey: "idem-quality", ticker: "AAPL", side: "buy" as const, quantity: 1 },
      trusted: trusted(),
      state: emptyState(),
    };

    expect(executePaperMarketOrderV3({ ...base, market: market({ verification: "CONFLICT" }) })).toEqual({ status: "REJECTED", reason: "MARKET_NOT_VERIFIED" });
    expect(executePaperMarketOrderV3({ ...base, market: market({ verification: "UNVERIFIED" }) })).toEqual({ status: "REJECTED", reason: "MARKET_NOT_VERIFIED" });
    expect(executePaperMarketOrderV3({ ...base, market: market({ observedAt: "2026-09-05T11:40:00.000Z" }) })).toEqual({ status: "REJECTED", reason: "MARKET_OBSERVATION_STALE" });
    expect(executePaperMarketOrderV3({ ...base, market: market({ observedAt: "2026-09-05T12:11:00.000Z" }) })).toEqual({ status: "REJECTED", reason: "MARKET_OBSERVATION_FUTURE" });
  });

  it("rejects invalid price, ticker identity and market currency instead of guessing", () => {
    const base = {
      intent: { idempotencyKey: "idem-market", ticker: "AAPL", side: "buy" as const, quantity: 1 },
      trusted: trusted(),
      state: emptyState(),
    };
    expect(executePaperMarketOrderV3({ ...base, market: market({ price: null }) })).toEqual({ status: "REJECTED", reason: "MARKET_PRICE_INVALID" });
    expect(executePaperMarketOrderV3({ ...base, market: market({ ticker: "MSFT" }) })).toEqual({ status: "REJECTED", reason: "MARKET_TICKER_MISMATCH" });
    expect(executePaperMarketOrderV3({ ...base, market: market({ currency: null }) })).toEqual({ status: "REJECTED", reason: "MARKET_CURRENCY_INVALID" });
  });

  it("never converts cash across currencies implicitly", () => {
    const result = executePaperMarketOrderV3({
      intent: { idempotencyKey: "idem-no-fx", ticker: "AAPL", side: "buy", quantity: 1 },
      trusted: trusted(),
      market: market({ currency: "USD" }),
      state: emptyState([{ currency: "SEK", amount: 100_000 }]),
    });
    expect(result).toEqual({ status: "REJECTED", reason: "INSUFFICIENT_CASH" });
  });

  it("supports long-only sells and computes realized P/L from the trusted fill ledger", () => {
    const bought = executePaperMarketOrderV3({
      intent: { idempotencyKey: "idem-buy", ticker: "AAPL", side: "buy", quantity: 2 },
      trusted: trusted("order-buy", "fill-buy"),
      market: market({ price: 100 }),
      state: emptyState(),
    });
    expect(bought.status).toBe("FILLED");
    if (bought.status !== "FILLED") return;

    const sold = executePaperMarketOrderV3({
      intent: { idempotencyKey: "idem-sell", ticker: "AAPL", side: "sell", quantity: 1 },
      trusted: trusted("order-sell", "fill-sell", "2026-09-05T12:12:00.000Z"),
      market: market({ price: 120, observedAt: "2026-09-05T12:11:30.000Z" }),
      state: bought.nextState,
    });
    expect(sold.status).toBe("FILLED");
    if (sold.status !== "FILLED") return;
    expect(sold.nextState.cash).toEqual([{ currency: "USD", amount: 920 }]);
    expect(sold.positionAfter).toMatchObject({ quantity: 1, averageCost: 100, costBasis: 100, realizedProfitLoss: 20 });

    const oversell = executePaperMarketOrderV3({
      intent: { idempotencyKey: "idem-oversell", ticker: "AAPL", side: "sell", quantity: 2 },
      trusted: trusted("order-oversell", "fill-oversell", "2026-09-05T12:13:00.000Z"),
      market: market({ price: 121, observedAt: "2026-09-05T12:12:30.000Z" }),
      state: sold.nextState,
    });
    expect(oversell).toEqual({ status: "REJECTED", reason: "INSUFFICIENT_POSITION" });
  });

  it("rejects duplicate successful idempotency keys", () => {
    const first = executePaperMarketOrderV3({
      intent: { idempotencyKey: "same-key", ticker: "AAPL", side: "buy", quantity: 1 },
      trusted: trusted(),
      market: market(),
      state: emptyState(),
    });
    expect(first.status).toBe("FILLED");
    if (first.status !== "FILLED") return;

    const duplicate = executePaperMarketOrderV3({
      intent: { idempotencyKey: "same-key", ticker: "AAPL", side: "buy", quantity: 1 },
      trusted: trusted("order-2", "fill-2", "2026-09-05T12:11:00.000Z"),
      market: market({ observedAt: "2026-09-05T12:10:30.000Z" }),
      state: first.nextState,
    });
    expect(duplicate).toEqual({ status: "REJECTED", reason: "DUPLICATE_IDEMPOTENCY_KEY" });
  });

  it("fails closed when historical fill state is internally impossible", () => {
    const impossibleSell: PaperFillV3 = {
      fillId: "bad-fill",
      orderId: "bad-order",
      idempotencyKey: "bad-key",
      ticker: "AAPL",
      side: "sell",
      quantity: 1,
      price: 100,
      grossAmount: 100,
      fee: 0,
      currency: "USD",
      executedAt: "2026-09-05T12:00:00.000Z",
      marketObservedAt: "2026-09-05T11:59:30.000Z",
      provider: "verified-market-provider",
      pricingBasis: "VERIFIED_OBSERVATION_EXACT",
      policyVersion: PAPER_TRADING_V3_POLICY_VERSION,
    };
    expect(derivePaperTradingLedgerV3([impossibleSell])).toEqual({ ok: false, reason: "LEDGER_INVALID" });

    const result = executePaperMarketOrderV3({
      intent: { idempotencyKey: "new-key", ticker: "AAPL", side: "buy", quantity: 1 },
      trusted: trusted(),
      market: market(),
      state: { cash: [{ currency: "USD", amount: 1000 }], fills: [impossibleSell] },
    });
    expect(result).toEqual({ status: "REJECTED", reason: "LEDGER_INVALID" });
  });

  it("keeps browser intent free from client-controlled execution facts", () => {
    const start = source.indexOf("export type PaperOrderIntentV3");
    const end = source.indexOf("};", start);
    const intentContract = source.slice(start, end);
    expect(intentContract).toContain("idempotencyKey");
    expect(intentContract).toContain("ticker");
    expect(intentContract).toContain("side");
    expect(intentContract).toContain("quantity");
    for (const forbidden of ["price", "currency", "provider", "executedAt", "observedAt", "fillId", "orderId", "serverReceivedAt"]) {
      expect(intentContract).not.toContain(forbidden);
    }
  });
});
