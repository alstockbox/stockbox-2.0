import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  adminEmails: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/env/server", () => ({ adminEmails: mocks.adminEmails }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { setAffiliateAmbassadorAction } from "../../src/app/admin/actions";

function request(userId: string, enabled: boolean) {
  const data = new FormData();
  data.set("userId", userId);
  data.set("enabled", String(enabled));
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
  });

  it("refuses to change any configured owner account even if its database role is customer", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: targetId, email: "owner2@stockbox.test", role: "customer" }, error: null });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })), rpc: mocks.rpc });

    await expect(setAffiliateAmbassadorAction(request(targetId, true))).rejects.toThrow("Admin accounts cannot be converted");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the service-role RPC so role update and audit log are atomic", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: targetId, email: "partner@stockbox.test", role: "customer" }, error: null });
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => ({ select })), rpc: mocks.rpc });

    await setAffiliateAmbassadorAction(request(targetId, true));

    expect(mocks.rpc).toHaveBeenCalledWith("set_affiliate_ambassador_role", {
      p_actor_id: adminId,
      p_target_id: targetId,
      p_enabled: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin");
  });
});
