import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { logApplicationError } from "../../src/lib/db/repositories";

describe("application error logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ insert: mocks.insert })),
    });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("sanitizes credentials before persisting admin-visible errors", async () => {
    await logApplicationError({
      service: "provider",
      message: "Bearer topsecret rk_live_do_not_log whsec_do_not_log sb_secret_do_not_log",
    });
    const payload = mocks.insert.mock.calls[0]?.[0];
    expect(payload.sanitized_error).not.toContain("topsecret");
    expect(payload.sanitized_error).not.toContain("rk_live_do_not_log");
    expect(payload.sanitized_error).not.toContain("whsec_do_not_log");
    expect(payload.sanitized_error).not.toContain("sb_secret_do_not_log");
  });
});