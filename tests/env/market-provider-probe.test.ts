import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchConfiguredMarketData: vi.fn(),
  getCurrentUser: vi.fn(),
  getMarketDataProvider: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/data/provider", () => ({ fetchConfiguredMarketData: mocks.fetchConfiguredMarketData }));
vi.mock("@/lib/env/server", () => ({ getMarketDataProvider: mocks.getMarketDataProvider }));

import { dynamic, GET } from "../../src/app/api/health/providers/market/route";

describe("admin market provider probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only sanitized live provider diagnostics to an admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", email: "owner@stockbox.test", role: "admin" });
    mocks.getMarketDataProvider.mockReturnValue("stooq");
    mocks.fetchConfiguredMarketData.mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      message: "upstream response containing a confidential header",
      diagnostic: { provider: "Stooq", capability: "market_data", status: "unavailable", reason: "rate_limited", observedAt: "2026-08-22T12:00:00.000Z" },
    });

    const response = await GET();
    const payload = await response.json();

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(payload).toEqual({
      provider: "stooq-eod",
      configured: true,
      status: "unavailable",
      reason: "rate_limited",
      testedSymbol: "AAPL",
      observedAt: "2026-08-22T12:00:00.000Z",
    });
    expect(JSON.stringify(payload)).not.toContain("confidential");
    expect(JSON.stringify(payload)).not.toContain("owner@stockbox.test");
  });

  it("rejects non-admin users without making an outbound probe", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@stockbox.test", role: "customer" });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.fetchConfiguredMarketData).not.toHaveBeenCalled();
  });
});
