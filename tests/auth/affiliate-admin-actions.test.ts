import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), createAdminClient: vi.fn(), adminEmails: vi.fn(),
  revalidatePath: vi.fn(), rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/env/server", () => ({ adminEmails: mocks.adminEmails }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { setAffiliateAmbassadorAccessAction } from "../../src/app/admin/actions";

function request(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const defaults = {
    userId: "22222222-2222-4222-8222-222222222222", enabled: "true",
    monthlyAnalyses: "150", deepAnalyses: "150", batchRows: "50",
    watchlistItems: "75", portfolios: "5", commissionPercent: "0",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) data.set(key, value);
  return data;
}

describe("affiliate ambassador admin action", () => {
  const adminId = "11111111-1111-4111-8111-111111111111";
  const targetId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: adminId, email: "admin@stockbox.test", role: "admin" });
    mocks.adminEmails.mockReturnValue(["admin@stockbox.test", "owner2@stockbox.test"]);
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const single = vi.fn().mockResolvedValue({ data: { id: targetId, email: "partner@stockbox.test", role: "customer" }, error: null });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })), rpc: mocks.rpc });
  });

  it("maps custom limits and commission percent to the atomic RPC", async () => {
    await setAffiliateAmbassadorAccessAction(request({ commissionPercent: "12.5" }));
    expect(mocks.rpc).toHaveBeenCalledWith("set_affiliate_ambassador_access", {
      p_actor_id: adminId, p_target_id: targetId, p_enabled: true,
      p_monthly_analyses: 150, p_deep_analyses: 150, p_batch_rows: 50,
      p_watchlist_items: 75, p_portfolios: 5, p_commission_basis_points: 1250,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it.each([
    [{ monthlyAnalyses: "-1" }, "Invalid ambassador settings"],
    [{ deepAnalyses: "151" }, "Invalid ambassador settings"],
    [{ batchRows: "51" }, "Invalid ambassador settings"],
    [{ commissionPercent: "100.01" }, "Invalid ambassador settings"],
  ])("rejects invalid limits %#", async (overrides, message) => {
    await expect(setAffiliateAmbassadorAccessAction(request(overrides))).rejects.toThrow(message);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses protected owner accounts even when database role is customer", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: targetId, email: "owner2@stockbox.test", role: "customer" }, error: null });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })), rpc: mocks.rpc });

    await expect(setAffiliateAmbassadorAccessAction(request())).rejects.toThrow("Admin accounts cannot be converted");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses changing the signed-in admin account", async () => {
    await expect(setAffiliateAmbassadorAccessAction(request({ userId: adminId }))).rejects.toThrow("own admin role");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
