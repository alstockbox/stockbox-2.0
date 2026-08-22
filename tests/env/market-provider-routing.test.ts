import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchStooqMarketData: vi.fn(),
  getMarketDataProvider: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getMarketDataProvider: mocks.getMarketDataProvider,
  isFinancialProviderConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/data/stooq", () => ({
  fetchStooqMarketData: mocks.fetchStooqMarketData,
  mapStooqSymbol: vi.fn(),
}));

import { fetchConfiguredMarketData } from "../../src/lib/data/provider";

const company = { ticker: "AAPL", name: "Apple Inc.", country: "US", exchange: "NASDAQ" };

describe("configured market provider routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes an enabled Stooq provider through the Stooq adapter", async () => {
    const adapterResult = {
      ok: true as const,
      data: { ticker: "AAPL", price: 230, currency: "USD", date: "2026-08-21", volume: 1, yearHigh: 240, yearLow: 170, performance: {} },
      diagnostic: { provider: "Stooq", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-22T00:00:00.000Z" },
    };
    mocks.getMarketDataProvider.mockReturnValue("stooq");
    mocks.fetchStooqMarketData.mockResolvedValue(adapterResult);

    await expect(fetchConfiguredMarketData(company)).resolves.toEqual(adapterResult);
    expect(mocks.fetchStooqMarketData).toHaveBeenCalledWith(company);
  });

  it("does not call Stooq when the provider is disabled", async () => {
    mocks.getMarketDataProvider.mockReturnValue("disabled");

    await expect(fetchConfiguredMarketData(company)).resolves.toEqual(expect.objectContaining({
      ok: false,
      reason: "not_configured",
    }));
    expect(mocks.fetchStooqMarketData).not.toHaveBeenCalled();
  });
});
