import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  referralMaybeSingle: vi.fn(),
  affiliateMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { getAffiliateCheckoutDiscount } from "../../src/lib/affiliate/discount";

function query(maybeSingle: ReturnType<typeof vi.fn>) {
  return { select: () => ({ eq: () => ({ maybeSingle }) }) };
}

describe("affiliate checkout discount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => table === "referrals"
        ? query(mocks.referralMaybeSingle)
        : query(mocks.affiliateMaybeSingle),
    });
  });
  it("returns ten percent for an attributed customer with an active affiliate", async () => {
    mocks.referralMaybeSingle.mockResolvedValue({ data: { affiliate_id: "aff_1" }, error: null });
    mocks.affiliateMaybeSingle.mockResolvedValue({ data: { status: "active" }, error: null });
    await expect(getAffiliateCheckoutDiscount("user_1")).resolves.toEqual({ eligible: true, percent: 10 });
  });

  it("returns no discount when the customer has no referral", async () => {
    mocks.referralMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getAffiliateCheckoutDiscount("user_1")).resolves.toEqual({ eligible: false, percent: 0 });
    expect(mocks.affiliateMaybeSingle).not.toHaveBeenCalled();
  });

  it("does not grant the discount for an inactive affiliate", async () => {
    mocks.referralMaybeSingle.mockResolvedValue({ data: { affiliate_id: "aff_1" }, error: null });
    mocks.affiliateMaybeSingle.mockResolvedValue({ data: { status: "inactive" }, error: null });
    await expect(getAffiliateCheckoutDiscount("user_1")).resolves.toEqual({ eligible: false, percent: 0 });
  });
});