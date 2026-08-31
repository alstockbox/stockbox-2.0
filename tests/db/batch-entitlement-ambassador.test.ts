import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { getBatchEntitlement } from "../../src/lib/db/repositories";

describe("ambassador batch entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("allows an active ambassador to use the configured batch entitlement without a paid subscription", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        configured: true,
        plan: "affiliate_ambassador",
        entitlements: { batchRows: 50 },
      },
      error: null,
    });
    await expect(getBatchEntitlement({
      userId: "ambassador_1",
      isAffiliateAmbassador: true,
    })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "affiliate_ambassador",
      rowLimit: 50,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_effective_workspace_entitlements", {
      p_user_id: "ambassador_1",
    });
  });
});
