import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "../../src/app/r/[code]/route";

describe("affiliate referral route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: { recorded: true }, error: null });
  });

  it("records a valid click and sets a 30-day HttpOnly first-touch cookie", async () => {
    const response = await GET(
      new Request("https://stockbox.test/r/sb_partner"),
      { params: Promise.resolve({ code: "sb_partner" }) },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://stockbox.test/auth/signup");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("stockbox_ref=sb_partner");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Max-Age=2592000");
    expect(mocks.rpc).toHaveBeenCalledWith("record_affiliate_click", { p_code: "sb_partner" });
  });

  it("does not set attribution for an invalid or inactive code", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { recorded: false }, error: null });
    const response = await GET(
      new Request("https://stockbox.test/r/not_active"),
      { params: Promise.resolve({ code: "not_active" }) },
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});