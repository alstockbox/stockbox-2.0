import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchStooqMarketData: vi.fn(),
  fetchTwelveDataMarketData: vi.fn(),
  fetchYahooMarketData: vi.fn(),
  getMarketDataProviderChain: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getMarketDataProviderChain: mocks.getMarketDataProviderChain,
  getServerEnv: mocks.getServerEnv,
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

vi.mock("@/lib/data/yahoo-market", () => ({
  yahooMarketDataProvider: {
    id: "yahoo-chart",
    capabilities: {
      supportedCountries: ["global"],
      supportedExchanges: ["Yahoo Finance chart catalog"],
      supportsFundamentals: false,
      supportsMarketData: true,
      supportsEstimates: false,
    },
    source: vi.fn(() => ({ name: "Yahoo Finance chart", url: "https://finance.yahoo.test", freshness: "15m" })),
    fetchMarketData: mocks.fetchYahooMarketData,
  },
}));

vi.mock("@/lib/data/twelve-data", () => ({
  createTwelveDataMarketProvider: vi.fn(() => ({
    id: "twelve-data",
    capabilities: {
      supportedCountries: ["global"],
      supportedExchanges: ["provider catalog"],
      supportsFundamentals: false,
      supportsMarketData: true,
      supportsEstimates: false,
    },
    source: vi.fn(() => ({ name: "Twelve Data", url: "https://twelvedata.test", freshness: "15m" })),
    fetchMarketData: mocks.fetchTwelveDataMarketData,
  })),
  createTwelveDataSearchProvider: vi.fn(),
}));

import {
  fetchConfiguredMarketData,
  fetchMarketDataFromProviders,
  smokeConfiguredMarketData,
} from "../../src/lib/data/provider";
import type { MarketDataProvider } from "../../src/lib/data/providers";

const company = { ticker: "AAPL", name: "Apple Inc.", country: "US", exchange: "NASDAQ" };

function env(overrides: Partial<ReturnType<typeof baseEnv>> = {}) {
  return { ...baseEnv(), ...overrides };
}

function baseEnv() {
  return {
    MARKET_DATA_PROVIDER: "stooq" as "stooq" | "twelve_data" | "disabled",
    MARKET_DATA_FALLBACK_PROVIDERS: [] as Array<"stooq" | "twelve_data">,
    TWELVE_DATA_API_KEY: "",
  };
}

function marketSnapshot(provider = "stooq-eod") {
  return {
    ticker: "AAPL",
    price: 230,
    currency: "USD",
    date: "2026-08-21",
    volume: 1,
    yearHigh: 240,
    yearLow: 170,
    provider,
    historyLength: 400,
    performance: { "3M": 0.12, "1Y": 0.25 },
  };
}

describe("configured market provider routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getServerEnv.mockReturnValue(env());
    mocks.getMarketDataProviderChain.mockReturnValue(["stooq"]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes an enabled Stooq provider through the Stooq adapter", async () => {
    const adapterResult = {
      ok: true as const,
      data: marketSnapshot(),
      diagnostic: { provider: "Stooq", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-22T00:00:00.000Z" },
    };
    mocks.fetchStooqMarketData.mockResolvedValue(adapterResult);

    await expect(fetchConfiguredMarketData(company)).resolves.toEqual(adapterResult);
    expect(mocks.fetchStooqMarketData).toHaveBeenCalledWith(company);
  });

  it("does not call Stooq when the provider is disabled", async () => {
    mocks.getMarketDataProviderChain.mockReturnValue([]);

    await expect(fetchConfiguredMarketData(company)).resolves.toEqual(expect.objectContaining({
      ok: false,
      reason: "not_configured",
    }));
    expect(mocks.fetchStooqMarketData).not.toHaveBeenCalled();
  });

  it("continues to a configured Twelve Data fallback after Stooq returns HTML", async () => {
    const fallbackResult = {
      ok: true as const,
      data: marketSnapshot("twelve-data"),
      diagnostic: { provider: "Twelve Data", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-23T00:00:00.000Z" },
    };
    mocks.getServerEnv.mockReturnValue(env({ MARKET_DATA_PROVIDER: "stooq", MARKET_DATA_FALLBACK_PROVIDERS: ["twelve_data"], TWELVE_DATA_API_KEY: "configured" }));
    mocks.getMarketDataProviderChain.mockReturnValue(["stooq", "twelve_data"]);
    mocks.fetchStooqMarketData.mockResolvedValue({
      ok: false,
      reason: "html_response",
      message: "Stooq returned HTML instead of market data.",
      diagnostic: { provider: "Stooq", capability: "market_data" as const, status: "unavailable" as const, reason: "html_response", observedAt: "2026-08-23T00:00:00.000Z" },
    });
    mocks.fetchTwelveDataMarketData.mockResolvedValue(fallbackResult);

    await expect(fetchConfiguredMarketData(company)).resolves.toEqual(fallbackResult);
    expect(mocks.fetchStooqMarketData).toHaveBeenCalledOnce();
    expect(mocks.fetchTwelveDataMarketData).toHaveBeenCalledOnce();
  });

  it("continues to Yahoo after Stooq returns HTML", async () => {
    const yahooResult = {
      ok: true as const,
      data: marketSnapshot("yahoo-chart"),
      diagnostic: { provider: "Yahoo Finance chart", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-24T00:00:00.000Z" },
    };
    mocks.getMarketDataProviderChain.mockReturnValue(["stooq", "yahoo"]);
    mocks.fetchStooqMarketData.mockResolvedValue({
      ok: false,
      reason: "html_response",
      message: "Stooq returned HTML instead of market data.",
      diagnostic: { provider: "Stooq", capability: "market_data" as const, status: "unavailable" as const, reason: "html_response", observedAt: "2026-08-24T00:00:00.000Z" },
    });
    mocks.fetchYahooMarketData.mockResolvedValue(yahooResult);

    await expect(fetchConfiguredMarketData(company)).resolves.toEqual(yahooResult);
    expect(mocks.fetchStooqMarketData).toHaveBeenCalledOnce();
    expect(mocks.fetchYahooMarketData).toHaveBeenCalledOnce();
  });

  it("reports an unconfigured Twelve Data provider before resolving Stooq in smoke diagnostics", async () => {
    mocks.getServerEnv.mockReturnValue(env({ MARKET_DATA_PROVIDER: "twelve_data", MARKET_DATA_FALLBACK_PROVIDERS: ["stooq"], TWELVE_DATA_API_KEY: "" }));
    mocks.getMarketDataProviderChain.mockReturnValue(["twelve_data", "stooq"]);
    mocks.fetchStooqMarketData.mockResolvedValue({
      ok: true as const,
      data: marketSnapshot(),
      diagnostic: { provider: "Stooq", capability: "market_data" as const, status: "available" as const, observedAt: "2026-08-23T00:00:00.000Z" },
    });

    const [probe] = await smokeConfiguredMarketData(["AAPL"]);

    expect(probe).toEqual(expect.objectContaining({
      symbol: "AAPL",
      status: "available",
      resolvedProvider: "stooq-eod",
      reason: null,
      historyLength: 400,
      momentum3MAvailable: true,
      momentum1YAvailable: true,
    }));
    expect(probe.attemptedProviders).toEqual([
      { provider: "Twelve Data", status: "unavailable", reason: "not_configured" },
      { provider: "Stooq", status: "available", reason: undefined },
    ]);
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
      data: marketSnapshot("licensed-fallback"),
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
      data: marketSnapshot("licensed-fallback"),
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
