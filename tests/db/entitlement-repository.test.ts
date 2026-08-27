import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { reserveAnalysisEntitlement } from "../../src/lib/db/repositories";

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
});
