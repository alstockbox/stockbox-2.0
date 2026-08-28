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
  it("preserves the affiliate ambassador entitlement identity", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        allowed: true,
        configured: true,
        plan: "affiliate_ambassador",
        reservationId: "reservation_1",
        usage: { analyses: 7, deepAnalyses: 2 },
        limits: { analyses: 100, deepAnalyses: 100 },
      },
      error: null,
    });

    const result = await reserveAnalysisEntitlement({
      userId: "ambassador_1",
      analysisType: "deep",
    });

    expect(result).toMatchObject({
      allowed: true,
      configured: true,
      plan: "affiliate_ambassador",
      reservationId: "reservation_1",
      limits: { analyses: 100, deepAnalyses: 100 },
    });
  });

  it("keeps admin batch access independent of subscription state", async () => {
    mocks.createAdminClient.mockClear();

    await expect(getBatchEntitlement({ userId: "admin_1", isAdmin: true })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "elite",
      rowLimit: 50,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it("gives affiliate ambassadors 50-row batch access without Stripe", async () => {
    mocks.createAdminClient.mockClear();

    await expect(getBatchEntitlement({
      userId: "ambassador_1",
      isAffiliateAmbassador: true,
    })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "affiliate_ambassador",
      rowLimit: 50,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

});
