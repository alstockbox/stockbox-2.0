import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getServerEnv: vi.fn(),
  headers: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { resetPasswordAction, signInAction, signUpAction, updatePasswordAction } from "../../src/lib/auth/actions";

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.42" }));
    mocks.getServerEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://stockbox.test" });
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    mocks.signUp.mockResolvedValue({ data: { user: null }, error: null });
    mocks.createAdminClient.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signUp: mocks.signUp,
        resetPasswordForEmail: mocks.resetPasswordForEmail,
        updateUser: mocks.updateUser,
      },
    });
  });

  it("rate limits repeated sign-in attempts before Supabase auth work", async () => {
    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      responses.push(await signInAction(
        { ok: false, message: "" },
        formData({ email: "rate@stockbox.test", password: "password123" }),
      ));
    }

    expect(responses.at(-1)).toEqual({
      ok: false,
      message: "Too many requests. Please try again shortly.",
    });
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(10);
  });

  it("rate limits repeated sign-up attempts before Supabase auth work", async () => {
    for (let index = 0; index < 11; index += 1) {
      await signUpAction(
        { ok: false, message: "" },
        formData({ email: "signup-rate@stockbox.test", password: "password123" }),
      );
    }

    expect(mocks.signUp).toHaveBeenCalledTimes(10);
  });

  it("records first-touch affiliate attribution after successful signup", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.77" }));
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    mocks.createAdminClient.mockReturnValue({ rpc });
    mocks.signUp.mockResolvedValueOnce({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null });

    const result = await signUpAction(
      { ok: false, message: "" },
      formData({ email: "referred@stockbox.test", password: "password123", referralCode: "arthur-01" }),
    );

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_affiliate_referral", {
      p_referred_id: "11111111-1111-4111-8111-111111111111",
      p_code: "ARTHUR-01",
    });
  });

  it("rate limits repeated password reset attempts before Supabase auth work", async () => {
    for (let index = 0; index < 11; index += 1) {
      await resetPasswordAction(
        { ok: false, message: "" },
        formData({ email: "reset-rate@stockbox.test" }),
      );
    }

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(10);
  });

  it("rate limits repeated password updates before Supabase auth work", async () => {
    for (let index = 0; index < 11; index += 1) {
      await updatePasswordAction(
        { ok: false, message: "" },
        formData({ password: "password123" }),
      );
    }

    expect(mocks.updateUser).toHaveBeenCalledTimes(10);
  });

  it("returns localized Swedish validation messages without changing auth behavior", async () => {
    const result = await signInAction(
      { ok: false, message: "" },
      formData({ locale: "sv", email: "not-an-email", password: "short" }),
    );
    expect(result).toEqual({
      ok: false,
      message: "Använd en giltig e-postadress och ett lösenord med minst 8 tecken.",
    });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
