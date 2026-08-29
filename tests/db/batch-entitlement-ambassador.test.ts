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
    const profiles = queryResult({ role: "affiliate_ambassador" });
    const affiliates = queryResult({ status: "active", monthly_analysis_limit: 20 });
    const subscriptions = queryResult(null);

    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "profiles") return profiles;
        if (table === "affiliates") return affiliates;
        if (table === "subscriptions") return subscriptions;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    await expect(getBatchEntitlement({ userId: "ambassador_1" })).resolves.toEqual({
      allowed: true,
      configured: true,
      plan: "affiliate_ambassador",
      rowLimit: 50,
    });
  });
});
