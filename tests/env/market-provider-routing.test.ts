import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchStooqMarketData: vi.fn(),
  getMarketDataProvider: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getMarketDataProvider: mocks.getMarketDataProvider,
  isFinancialProviderConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/data/stooq", () => ({
  stooqMarketDataProvider: {
    id: "stooq-eod",
    capabilities: {
      supportedCountries: ["US"],
      supportedExchanges: ["NYSE", "Nasdaq"],
      supportsFundamentals: false,
      supportsMarketData: true,
      supportsEstimates: false,
    },
    source: vi.fn(() => ({ name: "Stooq", url: "https://stooq.test", freshness: "EOD" })),
    fetchMarketData: mocks.fetchStooqMarketData,
  },
}));

import { fetchConfiguredMarketData, fetchMarketDataFromProviders } from "../../src/lib/data/provider";
import type { MarketDataProvider } from "../../src/lib/data/providers";

const company = { ticker: "AAPL", name: "Apple Inc.", country: "US", exchange: "NASDAQ" };

describe("configured market provider routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("uses an explicitly supplied fallback provider without changing analysis logic", async () => {
    const primaryFetch = vi.fn(async () => ({
      ok: false as const,
      reason: "upstream_error" as const,
      message: "Primary unavailable.",
      diagnostic: { provider: "Primary", capability: "market_data" as const, status: "unavailable" as const, reason: "upstream_error", observedAt: "2026-08-23T00:00:00.000Z" },
    }));
    const fallbackResult = {
      ok: true as const,
      data: { ticker: "AAPL", price: 231, currency: "USD", date: "2026-08-21", volume: 1, yearHigh: 240, yearLow: 170, performance: {} },
      diagnostic: { provider: "Licensed fallback", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-23T00:00:00.000Z" },
    };
    const fallbackFetch = vi.fn(async () => fallbackResult);
    const capabilities = {
      supportedCountries: ["US"],
      supportedExchanges: ["NYSE", "Nasdaq"],
      supportsFundamentals: false,
      supportsMarketData: true,
      supportsEstimates: false,
    };
    const providers: MarketDataProvider[] = [
      { id: "primary", capabilities, fetchMarketData: primaryFetch },
      { id: "licensed-fallback", capabilities, fetchMarketData: fallbackFetch },
    ];

    await expect(fetchMarketDataFromProviders(company, providers)).resolves.toEqual(fallbackResult);
    expect(primaryFetch).toHaveBeenCalledOnce();
    expect(fallbackFetch).toHaveBeenCalledOnce();
  });

  it("continues to an explicit fallback when the primary adapter throws", async () => {
    const primaryFetch = vi.fn(async () => {
      throw new Error("provider internals");
    });
    const fallbackResult = {
      ok: true as const,
      data: { ticker: "AAPL", price: 231, currency: "USD", date: "2026-08-21", volume: 1, yearHigh: 240, yearLow: 170, performance: {} },
      diagnostic: { provider: "Licensed fallback", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-23T00:00:00.000Z" },
    };
    const fallbackFetch = vi.fn(async () => fallbackResult);
    const capabilities = {
      supportedCountries: ["US"],
      supportedExchanges: ["NYSE", "Nasdaq"],
      supportsFundamentals: false,
      supportsMarketData: true,
      supportsEstimates: false,
    };

    await expect(fetchMarketDataFromProviders(company, [
      { id: "primary", capabilities, fetchMarketData: primaryFetch },
      { id: "licensed-fallback", capabilities, fetchMarketData: fallbackFetch },
    ])).resolves.toEqual(fallbackResult);
    expect(fallbackFetch).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "Market data provider failed unexpectedly",
      { resolvedProvider: "primary", symbol: "AAPL", reason: "upstream_error" },
    );
  });
});
