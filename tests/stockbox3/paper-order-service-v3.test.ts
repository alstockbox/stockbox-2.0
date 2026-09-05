import { describe, expect, it, vi } from "vitest";
import { executePaperOrderServiceV3 } from "@/lib/paper-trading/order-service-v3";
import type { PaperFillV3 } from "@/lib/paper-trading/engine-v3";

function accountState() {
  return {
    ok: true as const,
    account: {
      id: "account-1",
      userId: "user-1",
      name: "Paper",
      baseCurrency: "USD",
      status: "active" as const,
      createdAt: "2026-09-05T12:00:00.000Z",
      updatedAt: "2026-09-05T12:00:00.000Z",
    },
    state: { cash: [{ currency: "USD", amount: 1000 }], fills: [] },
    orders: [],
  };
}

function existingOrder(status: "filled" | "rejected" = "filled") {
  return {
    id: "order-existing",
    accountId: "account-1",
    idempotencyKey: "idem-1",
    ticker: "AAPL",
    side: "buy" as const,
    quantity: 1,
    status,
    rejectionReason: status === "rejected" ? "MARKET_NOT_VERIFIED" as const : null,
    submittedAt: "2026-09-05T12:10:00.000Z",
    policyVersion: "stockbox-paper-trading-v3.0.0",
  };
}

function deps() {
  let id = 0;
  return {
    featureEnabled: vi.fn(() => true),
    killed: vi.fn(() => false),
    findExisting: vi.fn(async () => ({ ok: true as const, order: null })),
    loadAccount: vi.fn(async () => accountState()),
    fetchQuote: vi.fn(async () => ({
      observation: {
        ticker: "AAPL",
        price: 100,
        currency: "USD",
        observedAt: "2026-09-05T12:09:30.000Z",
        provider: "yahoo-chart-execution",
        verification: "VERIFIED" as const,
      },
      reason: null,
    })),
    persistFill: vi.fn(async (input: { fill: PaperFillV3 }) => ({ ok: true as const, data: input.fill })),
    persistRejection: vi.fn(async (input: { reason: string; intent: { idempotencyKey: string; ticker: string; side: "buy" | "sell"; quantity: number }; submittedAt: string }) => ({
      ok: true as const,
      data: {
        id: "order-rejected",
        accountId: "account-1",
        idempotencyKey: input.intent.idempotencyKey,
        ticker: input.intent.ticker,
        side: input.intent.side,
        quantity: input.intent.quantity,
        status: "rejected" as const,
        rejectionReason: input.reason as "MARKET_NOT_VERIFIED",
        submittedAt: input.submittedAt,
        policyVersion: "stockbox-paper-trading-v3.0.0",
      },
    })),
    now: vi.fn(() => "2026-09-05T12:10:00.000Z"),
    randomId: vi.fn(() => `generated-${++id}`),
  };
}

const input = {
  userId: "user-1",
  accountId: "account-1",
  intent: { idempotencyKey: "idem-1", ticker: "aapl", side: "buy" as const, quantity: 1 },
};

describe("Paper order service V3", () => {
  it("does zero repository or quote work while the feature is dark", async () => {
    const d = deps();
    d.featureEnabled.mockReturnValue(false);
    await expect(executePaperOrderServiceV3(input, d)).resolves.toEqual({ status: "DISABLED" });
    expect(d.killed).not.toHaveBeenCalled();
    expect(d.findExisting).not.toHaveBeenCalled();
    expect(d.fetchQuote).not.toHaveBeenCalled();
  });

  it("honors the emergency kill switch before touching user state or market data", async () => {
    const d = deps();
    d.killed.mockReturnValue(true);
    await expect(executePaperOrderServiceV3(input, d)).resolves.toEqual({ status: "KILLED" });
    expect(d.findExisting).not.toHaveBeenCalled();
    expect(d.loadAccount).not.toHaveBeenCalled();
    expect(d.fetchQuote).not.toHaveBeenCalled();
  });

  it("short-circuits retries before account load and quote fetch", async () => {
    const d = deps();
    d.findExisting.mockResolvedValue({ ok: true, order: existingOrder() });
    const result = await executePaperOrderServiceV3(input, d);
    expect(result.status).toBe("ALREADY_RECORDED");
    expect(d.loadAccount).not.toHaveBeenCalled();
    expect(d.fetchQuote).not.toHaveBeenCalled();
  });

  it("loads trusted state, fetches a quote and persists only the engine-created fill", async () => {
    const d = deps();
    const result = await executePaperOrderServiceV3(input, d);
    expect(result).toEqual({ status: "FILLED", fillId: "generated-2", orderId: "generated-1" });
    expect(d.findExisting).toHaveBeenCalledWith({ userId: "user-1", accountId: "account-1", idempotencyKey: "idem-1" });
    expect(d.fetchQuote).toHaveBeenCalledWith("AAPL");
    expect(d.persistFill).toHaveBeenCalledTimes(1);
    const stored = d.persistFill.mock.calls[0][0].fill;
    expect(stored).toMatchObject({
      idempotencyKey: "idem-1",
      ticker: "AAPL",
      price: 100,
      currency: "USD",
      marketObservedAt: "2026-09-05T12:09:30.000Z",
      executedAt: "2026-09-05T12:10:00.000Z",
      provider: "yahoo-chart-execution",
      pricingBasis: "VERIFIED_OBSERVATION_EXACT",
    });
    expect(d.persistRejection).not.toHaveBeenCalled();
  });

  it("persists a fail-closed rejection when the market observation cannot be verified", async () => {
    const d = deps();
    d.fetchQuote.mockResolvedValue({
      observation: {
        ticker: "AAPL",
        price: null,
        currency: null,
        observedAt: null,
        provider: "yahoo-chart-execution",
        verification: "UNAVAILABLE",
      },
      reason: "rate_limited",
    });
    const result = await executePaperOrderServiceV3(input, d);
    expect(result).toEqual({ status: "REJECTED", reason: "MARKET_NOT_VERIFIED", persisted: true });
    expect(d.persistFill).not.toHaveBeenCalled();
    expect(d.persistRejection).toHaveBeenCalledWith(expect.objectContaining({
      reason: "MARKET_NOT_VERIFIED",
      submittedAt: "2026-09-05T12:10:00.000Z",
    }));
  });

  it("converts a DB cash race into a deterministic rejection after rechecking idempotency", async () => {
    const d = deps();
    d.findExisting.mockResolvedValue({ ok: true, order: null });
    d.persistFill.mockResolvedValue({ ok: false, error: "insufficient paper cash" });
    const result = await executePaperOrderServiceV3(input, d);
    expect(result).toEqual({ status: "REJECTED", reason: "INSUFFICIENT_CASH", persisted: true });
    expect(d.findExisting).toHaveBeenCalledTimes(2);
    expect(d.persistRejection).toHaveBeenCalledWith(expect.objectContaining({ reason: "INSUFFICIENT_CASH" }));
  });

  it("resolves a concurrent idempotent commit instead of recording a second outcome", async () => {
    const d = deps();
    d.findExisting
      .mockResolvedValueOnce({ ok: true, order: null })
      .mockResolvedValueOnce({ ok: true, order: existingOrder() });
    d.persistFill.mockResolvedValue({ ok: false, error: "duplicate key" });
    const result = await executePaperOrderServiceV3(input, d);
    expect(result.status).toBe("ALREADY_RECORDED");
    expect(d.persistRejection).not.toHaveBeenCalled();
  });

  it("rejects malformed client intent before repository or provider access", async () => {
    const d = deps();
    const result = await executePaperOrderServiceV3({
      ...input,
      intent: { ...input.intent, quantity: Number.NaN },
    }, d);
    expect(result).toEqual({ status: "REJECTED", reason: "INVALID_ORDER", persisted: false });
    expect(d.findExisting).not.toHaveBeenCalled();
    expect(d.fetchQuote).not.toHaveBeenCalled();
  });
});
