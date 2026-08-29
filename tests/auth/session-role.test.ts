import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminEmails: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  single: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ adminEmails: mocks.adminEmails }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { getCurrentUser } from "../../src/lib/auth/session";

describe("session roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminEmails.mockReturnValue([]);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "ambassador@test.com" } }, error: null });
    mocks.single.mockResolvedValue({ data: { role: "affiliate_ambassador" }, error: null });
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), single: mocks.single };
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: vi.fn(() => query) });
  });
  it("loads affiliate ambassador role from the server-side profile", async () => {
    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "ambassador@test.com",
      role: "affiliate_ambassador",
    });
  });

  it("keeps configured owner emails as admin even if profile role is lower", async () => {
    mocks.adminEmails.mockReturnValue(["ambassador@test.com"]);
    mocks.single.mockResolvedValue({ data: { role: "customer" }, error: null });
    await expect(getCurrentUser()).resolves.toEqual({
      id: "user-1",
      email: "ambassador@test.com",
      role: "admin",
    });
  });
});
