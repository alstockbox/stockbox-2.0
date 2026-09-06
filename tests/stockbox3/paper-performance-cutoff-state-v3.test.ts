import { describe, expect, it } from "vitest";
import type { PaperFillV3 } from "../../src/lib/paper-trading/engine-v3";
import { derivePaperStateAtCutoffV3 } from "../../src/lib/paper-trading/performance-v3";

function fill(overrides: Partial<PaperFillV3> = {}): PaperFillV3 {
  return {
    fillId: "fill-1",
    orderId: "order-1",
    idempotencyKey: "key-1",
    ticker: "AAPL",
    side: "buy",
    quantity: 10,
    price: 100,
    grossAmount: 1000,
    fee: 0,
    currency: "USD",
    executedAt: "2026-09-06T12:00:00.000Z",
    marketObservedAt: "2026-09-06T11:59:30.000Z",
    provider: "yahoo-chart-execution",
    pricingBasis: "VERIFIED_OBSERVATION_EXACT",
    policyVersion: "stockbox-paper-trading-v3.0.0",
    ...overrides,
  };
}

describe("Paper Trading V3 as-of-cutoff account state", () => {
  it("reconstructs cash from fixed starting capital and only fills at or before the common cutoff", () => {
    const result = derivePaperStateAtCutoffV3({
      baseCurrency: "USD",
      startingCash: 100_000,
      evaluationCutoff: "2026-09-06T12:30:00.000Z",
      fills: [
        fill(),
        fill({
          fillId: "fill-2",
          orderId: "order-2",
          idempotencyKey: "key-2",
          side: "sell",
          quantity: 4,
          price: 120,
          grossAmount: 480,
          executedAt: "2026-09-06T12:30:00.000Z",
        }),
        fill({
          fillId: "fill-3",
          orderId: "order-3",
          idempotencyKey: "key-3",
          quantity: 2,
          price: 130,
          grossAmount: 260,
          executedAt: "2026-09-06T12:30:00.001Z",
        }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.includedFillCount).toBe(2);
    expect(result.state.cash).toEqual([{ currency: "USD", amount: 99_480 }]);
    expect(result.state.fills.map((item) => item.fillId)).toEqual(["fill-1", "fill-2"]);
  });

  it("uses deterministic execution-time then fill-id ordering for the cutoff ledger", () => {
    const result = derivePaperStateAtCutoffV3({
      baseCurrency: "USD",
      startingCash: 100_000,
      evaluationCutoff: "2026-09-06T12:00:00.000Z",
      fills: [
        fill({ fillId: "b", orderId: "b", idempotencyKey: "b", side: "sell", quantity: 1, grossAmount: 100 }),
        fill({ fillId: "a", orderId: "a", idempotencyKey: "a", side: "buy", quantity: 1, grossAmount: 100 }),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.fills.map((item) => item.fillId)).toEqual(["a", "b"]);
    expect(result.state.cash[0]?.amount).toBe(100_000);
  });

  it("fails closed when any fill has an invalid execution timestamp because cutoff membership cannot be proven", () => {
    const result = derivePaperStateAtCutoffV3({
      baseCurrency: "USD",
      startingCash: 100_000,
      evaluationCutoff: "2026-09-06T12:30:00.000Z",
      fills: [fill({ executedAt: "not-a-time" })],
    });

    expect(result).toEqual({ ok: false, reason: "FILL_TIMESTAMP_INVALID" });
  });

  it("fails closed on included cross-currency fills instead of applying FX", () => {
    const result = derivePaperStateAtCutoffV3({
      baseCurrency: "USD",
      startingCash: 100_000,
      evaluationCutoff: "2026-09-06T12:30:00.000Z",
      fills: [fill({ currency: "SEK" })],
    });

    expect(result).toEqual({ ok: false, reason: "FILL_CURRENCY_MISMATCH" });
  });

  it("fails closed on impossible cash or position histories", () => {
    const overspend = derivePaperStateAtCutoffV3({
      baseCurrency: "USD",
      startingCash: 100_000,
      evaluationCutoff: "2026-09-06T12:30:00.000Z",
      fills: [fill({ quantity: 2, price: 60_000, grossAmount: 120_000 })],
    });
    expect(overspend).toEqual({ ok: false, reason: "CASH_LEDGER_INVALID" });

    const oversell = derivePaperStateAtCutoffV3({
      baseCurrency: "USD",
      startingCash: 100_000,
      evaluationCutoff: "2026-09-06T12:30:00.000Z",
      fills: [fill({ side: "sell", quantity: 1, grossAmount: 100 })],
    });
    expect(oversell).toEqual({ ok: false, reason: "LEDGER_INVALID" });
  });
});
