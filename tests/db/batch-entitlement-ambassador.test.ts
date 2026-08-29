import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { getBatchEntitlement } from "../../src/lib/db/repositories";

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return query;
}

describe("ambassador batch entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("allows an active ambassador to use batch without a paid subscription", async () => {
    const entitlements = queryResult({ batch_rows: 50 });

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "ambassador_entitlements") return entitlements;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    await expect(getBatchEntitlement({ userId: "ambassador_1", isAffiliateAmbassador: true })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "affiliate_ambassador",
      rowLimit: 50,
    });
  });
});
