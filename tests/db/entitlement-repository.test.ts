import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { getBatchEntitlement, reserveAnalysisEntitlement } from "../../src/lib/db/repositories";

describe("analysis entitlement repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("preserves custom affiliate ambassador analysis limits", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        allowed: true,
        configured: true,
        plan: "affiliate_ambassador",
        reservationId: "reservation_1",
        usage: { analyses: 7, deepAnalyses: 2 },
        limits: { analyses: 150, deepAnalyses: 40 },
      },
      error: null,
    });

    await expect(reserveAnalysisEntitlement({
      userId: "ambassador_1",
      analysisType: "deep",
    })).resolves.toMatchObject({
      allowed: true,
      plan: "affiliate_ambassador",
      limits: { analyses: 150, deepAnalyses: 40 },
    });
  });

  it("keeps admin batch access independent of subscription state", async () => {
    await expect(getBatchEntitlement({ userId: "admin_1", isAdmin: true })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "elite",
      rowLimit: 50,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("uses centralized effective workspace entitlements for ambassadors", async () => {
    mocks.rpc.mockResolvedValue({
      data: { plan: "affiliate_ambassador", configured: true, entitlements: { batchRows: 20 } },
      error: null,
    });
    await expect(getBatchEntitlement({
      userId: "ambassador_1",
      isAffiliateAmbassador: true,
    })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "affiliate_ambassador",
      rowLimit: 20,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_effective_workspace_entitlements", {
      p_user_id: "ambassador_1",
    });
  });

  it("gives promotional Standard users the Standard batch limit", async () => {
    mocks.rpc.mockResolvedValue({
      data: { plan: "standard", configured: true, entitlements: { batchRows: 25 } },
      error: null,
    });
    await expect(getBatchEntitlement({ userId: "promo_1" })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "standard",
      rowLimit: 25,
    });
  });

  it("fails closed when an ambassador entitlement row is missing", async () => {
    mocks.rpc.mockResolvedValue({
      data: { plan: "affiliate_ambassador", configured: false, entitlements: { batchRows: 0 } },
      error: null,
    });
    await expect(getBatchEntitlement({
      userId: "ambassador_missing",
      isAffiliateAmbassador: true,
    })).resolves.toEqual({
      allowed: false,
      configured: false,
      plan: "affiliate_ambassador",
      rowLimit: 0,
    });
  });

  it("fails closed when the effective entitlement RPC is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "rpc unavailable" } });
    await expect(getBatchEntitlement({ userId: "customer_1" })).resolves.toEqual({
      allowed: false,
      configured: false,
      plan: "free",
      rowLimit: 0,
    });
  });

  it("fails closed when the effective entitlement payload has an unknown plan", async () => {
    mocks.rpc.mockResolvedValue({
      data: { plan: "future_plan", configured: true, entitlements: { batchRows: 40 } },
      error: null,
    });
    await expect(getBatchEntitlement({ userId: "customer_1" })).resolves.toEqual({
      allowed: false,
      configured: false,
      plan: "free",
      rowLimit: 0,
    });
  });

  it("fails closed when the analysis entitlement payload has an unknown plan", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        allowed: true,
        configured: true,
        plan: "future_plan",
        reservationId: "reservation_1",
        usage: { analyses: 0, deepAnalyses: 0 },
        limits: { analyses: 999, deepAnalyses: 999 },
      },
      error: null,
    });
    await expect(reserveAnalysisEntitlement({
      userId: "customer_1",
      analysisType: "summary",
    })).resolves.toEqual({
      allowed: false,
      configured: false,
      plan: "free",
      reservationId: null,
      usage: { analyses: 0, deepAnalyses: 0 },
      limits: { analyses: 3, deepAnalyses: 1 },
    });
  });
});
