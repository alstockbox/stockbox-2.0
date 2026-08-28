import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
    mocks.signUp.mockResolvedValue({ error: null });
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
        formData({ email: "signup-rate@stockbox.test", password: "StrongPass123!" }),
      );
    }

    expect(mocks.signUp).toHaveBeenCalledTimes(10);
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
        formData({ password: "StrongPass123!" }),
      );
    }

    expect(mocks.updateUser).toHaveBeenCalledTimes(10);
  });

  it("explains when Supabase temporarily cannot send a sign-up confirmation email", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.61" }));
    mocks.signUp.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" },
    });

    const result = await signUpAction(
      { ok: false, message: "" },
      formData({ email: "email-busy-signup@stockbox.test", password: "StrongPass123!" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Verification email is temporarily unavailable. Please wait a moment and try again.",
    });
  });

  it("explains when Supabase temporarily cannot send a password recovery email", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.62" }));
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" },
    });

    const result = await resetPasswordAction(
      { ok: false, message: "" },
      formData({ locale: "sv", email: "email-busy-reset@stockbox.test" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Verifieringsmejl är tillfälligt otillgängliga. Vänta en stund och försök igen.",
    });
  });

  it("rejects weak new passwords at sign-up before Supabase auth work", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.51" }));
    const result = await signUpAction(
      { ok: false, message: "" },
      formData({ email: "new-user@stockbox.test", password: "password123" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Use at least 12 characters with uppercase, lowercase, a number, and a symbol.",
    });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("rejects weak replacement passwords before updating the user", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.52" }));
    const result = await updatePasswordAction(
      { ok: false, message: "" },
      formData({ locale: "sv", password: "Password123" }),
    );

    expect(result).toEqual({
      ok: false,
      message: "Använd minst 12 tecken med stor bokstav, liten bokstav, siffra och symbol.",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("keeps existing eight-character passwords eligible for sign-in", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.53" }));
    await signInAction(
      { ok: false, message: "" },
      formData({ email: "existing@stockbox.test", password: "oldpass8" }),
    );

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "existing@stockbox.test",
      password: "oldpass8",
    });
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
