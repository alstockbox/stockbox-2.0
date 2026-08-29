import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { checkDistributedRateLimit } from "../../src/lib/security/rate-limit";

const policy = { limit: 1, windowMs: 60_000 };

describe("distributed rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the atomic Supabase limiter when the admin client is configured", async () => {
    mocks.rpc.mockResolvedValue({
      data: { allowed: false, remaining: 0, reset_at: "2026-08-27T12:01:00.000Z", retry_after_seconds: 42 },
      error: null,
    });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });

    const result = await checkDistributedRateLimit("analysis:user:1", policy, Date.parse("2026-08-27T12:00:00.000Z"));

    expect(mocks.rpc).toHaveBeenCalledWith("consume_rate_limit", expect.objectContaining({
      p_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/), p_limit: 1, p_window_seconds: 60,
    }));
    expect(result).toEqual(expect.objectContaining({ allowed: false, limit: 1, remaining: 0, retryAfterSeconds: 42 }));
  });

  it("falls back to the local limiter when Supabase is not configured", async () => {
    mocks.createAdminClient.mockReturnValue(null);
    const key = "search:ip:fallback-unconfigured";

    expect((await checkDistributedRateLimit(key, policy, 1_000)).allowed).toBe(true);
    expect((await checkDistributedRateLimit(key, policy, 1_001)).allowed).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps local defense-in-depth when the distributed RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "rpc unavailable" } });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
    const key = "share:user:rpc-failure";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect((await checkDistributedRateLimit(key, policy, 2_000)).allowed).toBe(true);
    expect((await checkDistributedRateLimit(key, policy, 2_001)).allowed).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
