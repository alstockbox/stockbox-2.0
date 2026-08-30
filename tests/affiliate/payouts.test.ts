import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  transferCreate: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: vi.fn(() => ({ transfers: { create: mocks.transferCreate } })),
  getSafeStripeErrorDiagnostic: vi.fn(() => ({ message: "Transfer failed", code: "test_error" })),
}));

import { affiliatePayoutKey, runAffiliatePayout } from "@/lib/affiliate/payouts";

describe("affiliate payouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
  });

  it("uses a stable daily Stripe idempotency key", () => {
    expect(affiliatePayoutKey("affiliate-1", new Date("2026-08-29T08:00:00Z")))
      .toBe("affiliate-payout:affiliate-1:2026-08-29");
  });

  it("queues, transfers, and completes one payout", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { ok: true, payoutId: "payout-1", amountCents: 12500, connectAccountId: "acct_1" },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.transferCreate.mockResolvedValue({ id: "tr_1" });

    const result = await runAffiliatePayout("affiliate-1", new Date("2026-08-29T08:00:00Z"));

    expect(result.status).toBe("paid");
    expect(mocks.transferCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 12500, currency: "sek", destination: "acct_1" }),
      { idempotencyKey: "affiliate-payout:affiliate-1:2026-08-29" }
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_affiliate_payout", {
      p_payout_id: "payout-1",
      p_stripe_transfer_id: "tr_1",
    });
  });

  it("releases a queued payout when Stripe transfer fails", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { ok: true, payoutId: "payout-2", amountCents: 15000, connectAccountId: "acct_2" },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.transferCreate.mockRejectedValue(new Error("network"));

    const result = await runAffiliatePayout("affiliate-2", new Date("2026-08-29T08:00:00Z"));

    expect(result.status).toBe("failed");
    expect(mocks.rpc).toHaveBeenLastCalledWith("fail_affiliate_payout", {
      p_payout_id: "payout-2",
      p_reason: "Transfer failed",
    });
  });

  it("does not call Stripe when nothing is payable", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, reason: "below_minimum", amountCents: 5200 }, error: null,
    });
    const result = await runAffiliatePayout("affiliate-3", new Date("2026-08-29T08:00:00Z"));
    expect(result.status).toBe("below_minimum");
    expect(mocks.transferCreate).not.toHaveBeenCalled();
  });
});
