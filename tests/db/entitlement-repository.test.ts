import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { getBatchEntitlement, reserveAnalysisEntitlement } from "../../src/lib/db/repositories";

describe("analysis entitlement repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.single.mockResolvedValue({ data: { batch_rows: 20 }, error: null });
    mocks.eq.mockReturnValue({ single: mocks.single });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
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

    const result = await reserveAnalysisEntitlement({
      userId: "ambassador_1",
      analysisType: "deep",
    });

    expect(result).toMatchObject({
      allowed: true,
      plan: "affiliate_ambassador",
      limits: { analyses: 150, deepAnalyses: 40 },
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

  it("reads an ambassador's configured batch limit instead of hard-coding 50", async () => {
    await expect(getBatchEntitlement({
      userId: "ambassador_1",
      isAffiliateAmbassador: true,
    })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "affiliate_ambassador",
      rowLimit: 20,
    });
    expect(mocks.from).toHaveBeenCalledWith("ambassador_entitlements");
    expect(mocks.select).toHaveBeenCalledWith("batch_rows");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "ambassador_1");
  });
});
