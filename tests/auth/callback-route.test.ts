import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "@/app/auth/callback/route";

describe("auth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession, verifyOtp: mocks.verifyOtp } });
  });

  it("sends verified cross-device users to login instead of a false callback error", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("PKCE code verifier not found") });
    const response = await GET(new NextRequest("https://www.getstockbox.app/auth/callback?code=verified-code&next=/onboarding"));
    expect(response.headers.get("location")).toBe("https://www.getstockbox.app/auth/login?confirmed=1");
  });

  it("sends cross-device recovery PKCE failures back to password recovery", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("PKCE code verifier not found") });
    const response = await GET(new NextRequest("https://www.getstockbox.app/auth/callback?code=recovery-code&next=/auth/reset"));

    expect(response.headers.get("location")).toBe("https://www.getstockbox.app/auth/forgot?retry=1");
  });

  it("verifies a token-hash signup link server-side and redirects to onboarding", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest("https://www.getstockbox.app/auth/callback?token_hash=signup-hash&type=email&next=/onboarding"));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "signup-hash", type: "email" });
    expect(response.headers.get("location")).toBe("https://www.getstockbox.app/onboarding");
  });

  it("verifies a cross-device recovery token and creates the reset session", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest("https://www.getstockbox.app/auth/callback?token_hash=recovery-hash&type=recovery&next=/auth/reset"));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "recovery-hash", type: "recovery" });
    expect(response.headers.get("location")).toBe("https://www.getstockbox.app/auth/reset");
  });

  it("rejects an external next path even when a token is valid", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest("https://www.getstockbox.app/auth/callback?token_hash=recovery-hash&type=recovery&next=https://evil.example"));

    expect(response.headers.get("location")).toBe("https://www.getstockbox.app/dashboard");
  });
});