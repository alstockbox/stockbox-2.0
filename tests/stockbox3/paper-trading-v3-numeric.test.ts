import { describe, expect, it } from "vitest";
import { derivePaperTradingLedgerV3, PAPER_TRADING_V3_POLICY_VERSION, type PaperFillV3 } from "@/lib/paper-trading/engine-v3";

function fill(overrides: Partial<PaperFillV3> = {}): PaperFillV3 {
  return {
    fillId: "fill-decimal",
    orderId: "order-decimal",
    idempotencyKey: "idem-decimal",
    ticker: "TEST",
    side: "buy",
    quantity: 0.1,
    price: 0.2,
    grossAmount: 0.02,
    fee: 0,
    currency: "USD",
    executedAt: "2026-09-05T12:00:00.000Z",
    marketObservedAt: "2026-09-05T11:59:30.000Z",
    provider: "verified-market-provider",
    pricingBasis: "VERIFIED_OBSERVATION_EXACT",
    policyVersion: PAPER_TRADING_V3_POLICY_VERSION,
    ...overrides,
  };
}

describe("Paper Trading V3 numeric integrity", () => {
  it("accepts tiny IEEE-754 round-trip noise from database numeric values", () => {
    const result = derivePaperTradingLedgerV3([fill()]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.positions[0]).toMatchObject({ ticker: "TEST", quantity: 0.1, costBasis: 0.02 });
  });

  it("still rejects economically different or tampered gross amounts", () => {
    expect(derivePaperTradingLedgerV3([fill({ grossAmount: 0.021 })])).toEqual({ ok: false, reason: "LEDGER_INVALID" });
    expect(derivePaperTradingLedgerV3([fill({ grossAmount: Number.NaN })])).toEqual({ ok: false, reason: "LEDGER_INVALID" });
  });
});
