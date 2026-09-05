import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PAPER_TRADING_V3_POLICY_VERSION, type PaperFillV3 } from "@/lib/paper-trading/engine-v3";
import { toPaperFillRpcParamsV3, toPaperRejectionRpcParamsV3 } from "@/lib/paper-trading/repository-v3";

const source = readFileSync("src/lib/paper-trading/repository-v3.ts", "utf8");

function validFill(overrides: Partial<PaperFillV3> = {}): PaperFillV3 {
  return {
    fillId: "temporary-fill",
    orderId: "temporary-order",
    idempotencyKey: "idem-1",
    ticker: "AAPL",
    side: "buy",
    quantity: 2,
    price: 100,
    grossAmount: 200,
    fee: 0,
    currency: "USD",
    executedAt: "2026-09-05T20:00:00.000Z",
    marketObservedAt: "2026-09-05T19:59:30.000Z",
    provider: "verified-market-provider",
    pricingBasis: "VERIFIED_OBSERVATION_EXACT",
    policyVersion: PAPER_TRADING_V3_POLICY_VERSION,
    ...overrides,
  };
}

describe("Paper Trading V3 repository", () => {
  it("maps only trusted fill facts into the service-role fill RPC", () => {
    expect(toPaperFillRpcParamsV3({ userId: "user-1", accountId: "account-1", fill: validFill() })).toEqual({
      p_user_id: "user-1",
      p_account_id: "account-1",
      p_idempotency_key: "idem-1",
      p_ticker: "AAPL",
      p_side: "buy",
      p_quantity: 2,
      p_price: 100,
      p_currency: "USD",
      p_market_observed_at: "2026-09-05T19:59:30.000Z",
      p_provider: "verified-market-provider",
      p_market_verification: "VERIFIED",
      p_executed_at: "2026-09-05T20:00:00.000Z",
    });
  });

  it("does not persist caller-controlled gross amount, fee, IDs or policy fields", () => {
    const params = toPaperFillRpcParamsV3({ userId: "user-1", accountId: "account-1", fill: validFill() });
    expect(params).not.toBeNull();
    expect(params).not.toHaveProperty("p_gross_amount");
    expect(params).not.toHaveProperty("p_fee");
    expect(params).not.toHaveProperty("p_fill_id");
    expect(params).not.toHaveProperty("p_order_id");
    expect(params).not.toHaveProperty("p_policy_version");
    expect(params).not.toHaveProperty("p_pricing_basis");
  });

  it("refuses fills that do not match the current simulator policy", () => {
    expect(toPaperFillRpcParamsV3({ userId: "user-1", accountId: "account-1", fill: validFill({ fee: 1 }) })).toBeNull();
    expect(toPaperFillRpcParamsV3({ userId: "user-1", accountId: "account-1", fill: validFill({ policyVersion: "other-policy" }) })).toBeNull();
  });

  it("maps rejected order facts without adding execution price or currency", () => {
    const params = toPaperRejectionRpcParamsV3({
      userId: "user-1",
      accountId: "account-1",
      intent: { idempotencyKey: "idem-rejected", ticker: "MSFT", side: "sell", quantity: 3 },
      reason: "MARKET_OBSERVATION_STALE",
      submittedAt: "2026-09-05T20:00:00.000Z",
    });
    expect(params).toEqual({
      p_user_id: "user-1",
      p_account_id: "account-1",
      p_idempotency_key: "idem-rejected",
      p_ticker: "MSFT",
      p_side: "sell",
      p_quantity: 3,
      p_rejection_reason: "MARKET_OBSERVATION_STALE",
      p_submitted_at: "2026-09-05T20:00:00.000Z",
    });
    expect(params).not.toHaveProperty("p_price");
    expect(params).not.toHaveProperty("p_currency");
  });

  it("writes paper state only through the three trusted RPCs", () => {
    expect(source).toContain('rpc("create_paper_account_v3"');
    expect(source).toContain('rpc("record_paper_rejection_v3"');
    expect(source).toContain('rpc("record_paper_fill_v3"');
    expect(source).not.toMatch(/\.from\("paper_[^"]+"\)\s*\.insert\(/);
    expect(source).not.toMatch(/\.from\("paper_[^"]+"\)\s*\.update\(/);
    expect(source).not.toMatch(/\.from\("paper_[^"]+"\)\s*\.delete\(/);
  });

  it("filters every account-state read by both account and user and revalidates the fill ledger", () => {
    expect(source).toContain('.eq("id", accountId)');
    expect(source).toContain('.eq("user_id", userId)');
    expect(source.match(/\.eq\("account_id", accountId\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source.match(/\.eq\("user_id", userId\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).toContain("derivePaperTradingLedgerV3(validFills)");
    expect(source).toContain('error: "PAPER_FILL_LEDGER_INVALID"');
  });

  it("provides an explicit idempotency lookup that includes rejected orders", () => {
    expect(source).toContain("findPaperOrderByIdempotencyV3");
    expect(source).toContain('.eq("idempotency_key", key)');
    expect(source).toContain("rejectionReason");
  });
});
