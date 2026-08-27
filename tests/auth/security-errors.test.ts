import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getServerEnv: vi.fn(),
  headers: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: mocks.getServerEnv,
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { signInAction, signUpAction, resetPasswordAction, updatePasswordAction } from "../../src/lib/auth/actions";

function data(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("auth error disclosure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    mocks.getServerEnv.mockReturnValue({ NEXT_PUBLIC_APP_URL: "https://stockbox.test" });
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({ auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      updateUser: mocks.updateUser,
    } });
  });
  it("does not expose raw Supabase sign-in errors", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: "postgres detail: invalid grant" } });
    const result = await signInAction({ ok: false, message: "" }, data({ email: "a@b.se", password: "password123" }));
    expect(result.message).not.toContain("postgres detail");
  });

  it("does not expose raw Supabase sign-up errors", async () => {
    mocks.signUp.mockResolvedValue({ error: { message: "duplicate key violates constraint users_email_key" } });
    const result = await signUpAction({ ok: false, message: "" }, data({ email: "signup@b.se", password: "password123" }));
    expect(result.message).not.toContain("duplicate key");
  });

  it("does not expose raw password-reset or password-update errors", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { message: "smtp internal failure xyz" } });
    mocks.updateUser.mockResolvedValue({ error: { message: "auth backend detail xyz" } });
    const reset = await resetPasswordAction({ ok: false, message: "" }, data({ email: "reset@b.se" }));
    const update = await updatePasswordAction({ ok: false, message: "" }, data({ password: "password123" }));
    expect(reset.message).not.toContain("smtp internal");
    expect(update.message).not.toContain("backend detail");
  });
});
