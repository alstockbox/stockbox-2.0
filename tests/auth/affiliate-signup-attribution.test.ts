import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getServerEnv: vi.fn(),
  headers: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  rpc: vi.fn(),
  signUp: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: mocks.cookies }));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { signUpAction } from "../../src/lib/auth/actions";

function signupData() {
  const data = new FormData();
  data.set("email", "new@stockbox.test");
  data.set("password", "StrongPass123!");
  return data;
}

describe("affiliate signup attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.52" }));
    mocks.getServerEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://stockbox.test" });
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.signUp.mockResolvedValue({ data: { user: { id: "referred_user_1" } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { signUp: mocks.signUp } });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "consume_rate_limit") {
        const limit = Number(args.p_limit);
        return { data: { allowed: true, remaining: Math.max(0, limit - 1), reset_at: "2026-08-29T20:30:00.000Z", retry_after_seconds: 0 }, error: null };
      }
      if (fn === "attribute_affiliate_signup") return { data: { attributed: true }, error: null };
      if (fn === "record_affiliate_referral") return { data: { ok: true }, error: null };
      return { data: null, error: null };
    });
    mocks.cookies.mockResolvedValue({
      get: vi.fn((name: string) => name === "stockbox_ref" ? { value: "sb_partner" } : undefined),
      delete: mocks.cookieDelete,
    });
  });
  it("binds the referral to the newly created user and clears the cookie", async () => {
    const result = await signUpAction({ ok: false, message: "" }, signupData());
    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("attribute_affiliate_signup", {
      p_code: "sb_partner",
      p_referred_user_id: "referred_user_1",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("record_affiliate_referral", {
      p_code: "sb_partner",
      p_referred_id: "referred_user_1",
    });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("stockbox_ref");
  });

  it("never blocks account creation when attribution persistence fails", async () => {
    mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "consume_rate_limit") {
        const limit = Number(args.p_limit);
        return { data: { allowed: true, remaining: Math.max(0, limit - 1), reset_at: "2026-08-29T20:30:00.000Z", retry_after_seconds: 0 }, error: null };
      }
      throw new Error("affiliate database unavailable");
    });
    const result = await signUpAction({ ok: false, message: "" }, signupData());
    expect(result.ok).toBe(true);
  });
});