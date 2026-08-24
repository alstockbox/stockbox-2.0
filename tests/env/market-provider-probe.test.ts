import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configuredMarketDataProviderStatuses: vi.fn(),
  getCurrentUser: vi.fn(),
  smokeConfiguredMarketData: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/data/provider", () => ({
  configuredMarketDataProviderStatuses: mocks.configuredMarketDataProviderStatuses,
  smokeConfiguredMarketData: mocks.smokeConfiguredMarketData,
}));

import { dynamic, GET } from "../../src/app/api/health/providers/market/route";

describe("admin market provider probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only sanitized live provider diagnostics to an admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", email: "owner@stockbox.test", role: "admin" });
    mocks.configuredMarketDataProviderStatuses.mockReturnValue([
      { key: "twelve_data", providerId: "twelve-data", label: "Twelve Data", configured: false, reason: "not_configured" },
      { key: "stooq", providerId: "stooq-eod", label: "Stooq", configured: true },
    ]);
    mocks.smokeConfiguredMarketData.mockResolvedValue([
      {
        symbol: "AAPL",
        status: "available",
        attemptedProviders: [
          { provider: "Twelve Data", status: "unavailable", reason: "not_configured" },
          { provider: "Stooq", status: "available" },
        ],
        resolvedProvider: "stooq-eod",
        reason: null,
        priceDate: "2026-08-21",
        historyLength: 400,
        momentum3MAvailable: true,
        momentum1YAvailable: true,
        betaAvailable: false,
        marketCapAvailable: false,
        observedAt: "2026-08-22T12:00:00.000Z",
      },
    ]);

    const response = await GET();
    const payload = await response.json();

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      providerChain: [
        { key: "twelve_data", providerId: "twelve-data", label: "Twelve Data", configured: false, reason: "not_configured" },
        { key: "stooq", providerId: "stooq-eod", label: "Stooq", configured: true },
      ],
      configured: true,
      status: "available",
      probes: expect.arrayContaining([
        expect.objectContaining({
          symbol: "AAPL",
          resolvedProvider: "stooq-eod",
          priceDate: "2026-08-21",
          historyLength: 400,
        }),
      ]),
      observedAt: expect.any(String),
    }));
    expect(JSON.stringify(payload)).not.toContain("confidential");
    expect(JSON.stringify(payload)).not.toContain("owner@stockbox.test");
  });

  it("rejects non-admin users without making an outbound probe", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", email: "user@stockbox.test", role: "customer" });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.smokeConfiguredMarketData).not.toHaveBeenCalled();
  });
});
