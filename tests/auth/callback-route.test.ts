import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "@/app/auth/callback/route";

describe("auth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } });
  });

  it("sends verified cross-device users to login instead of a false callback error", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: new Error("PKCE code verifier not found") });
    const response = await GET(new NextRequest("https://www.getstockbox.app/auth/callback?code=verified-code&next=/onboarding"));
    expect(response.headers.get("location")).toBe("https://www.getstockbox.app/auth/login?confirmed=1");
  });
});