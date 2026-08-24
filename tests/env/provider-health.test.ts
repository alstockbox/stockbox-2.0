import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configuredMarketDataProviderStatuses: vi.fn(),
  getMarketDataProvider: vi.fn(),
  getMarketDataProviderChain: vi.fn(),
  getSecUserAgent: vi.fn(),
  getServerEnv: vi.fn()
}));

vi.mock("@/lib/data/provider", () => ({
  configuredMarketDataProviderStatuses: mocks.configuredMarketDataProviderStatuses,
}));
vi.mock("@/lib/env/server", () => ({
  getMarketDataProvider: mocks.getMarketDataProvider,
  getMarketDataProviderChain: mocks.getMarketDataProviderChain,
  getSecUserAgent: mocks.getSecUserAgent,
  getServerEnv: mocks.getServerEnv
}));

import { dynamic, GET } from "../../src/app/api/health/providers/route";

describe("provider health diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMarketDataProvider.mockReturnValue("stooq");
    mocks.getMarketDataProviderChain.mockReturnValue(["stooq"]);
    mocks.configuredMarketDataProviderStatuses.mockReturnValue([
      { key: "stooq", providerId: "stooq-eod", label: "Stooq", configured: true },
    ]);
  });

  it("returns only non-sensitive explicit SEC status", async () => {
    mocks.getServerEnv.mockReturnValue({
      SEC_USER_AGENT: "StockBox/2.0 secret-contact@stockbox.test",
      ADMIN_ALERT_EMAIL: "alerts@stockbox.test",
      ADMIN_EMAILS: "owner@stockbox.test",
      MARKET_DATA_PROVIDER: "stooq"
    });
    mocks.getSecUserAgent.mockReturnValue(
      "StockBox/2.0 secret-contact@stockbox.test"
    );

    const response = GET();
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(dynamic).toBe("force-dynamic");
    expect(payload).toEqual(expect.objectContaining({
      secConfigured: true,
      secUserAgentExplicit: true,
      marketProvider: "stooq",
      marketProviderChain: ["stooq"],
    }));
    expect(payload.providers.fundamentals.capabilities.supportsFundamentals).toBe(true);
    expect(payload.providers.marketData.capabilities.supportsMarketData).toBe(true);
    expect(serialized).not.toContain("secret-contact@stockbox.test");
    expect(serialized).not.toContain("alerts@stockbox.test");
    expect(serialized).not.toContain("owner@stockbox.test");
    expect(serialized).not.toContain("StockBox/2.0");
  });

  it("reports fallback readiness without exposing the fallback contact", async () => {
    mocks.getServerEnv.mockReturnValue({
      SEC_USER_AGENT: "",
      ADMIN_ALERT_EMAIL: "alerts@stockbox.test",
      MARKET_DATA_PROVIDER: "stooq"
    });
    mocks.getSecUserAgent.mockReturnValue("StockBox/1.0 alerts@stockbox.test");

    const payload = await GET().json();

    expect(payload).toEqual(expect.objectContaining({
      secConfigured: true,
      secUserAgentExplicit: false,
      marketProvider: "stooq",
      marketProviderChain: ["stooq"],
    }));
    expect(JSON.stringify(payload)).not.toContain("alerts@stockbox.test");
  });

  it("reports an explicitly disabled market adapter", async () => {
    mocks.getServerEnv.mockReturnValue({ SEC_USER_AGENT: "", MARKET_DATA_PROVIDER: "disabled" });
    mocks.getSecUserAgent.mockReturnValue(null);
    mocks.getMarketDataProvider.mockReturnValue("disabled");
    mocks.getMarketDataProviderChain.mockReturnValue([]);
    mocks.configuredMarketDataProviderStatuses.mockReturnValue([]);

    const payload = await GET().json();

    expect(payload.marketProvider).toBe("disabled");
    expect(payload.providers.marketData).toEqual(expect.objectContaining({ id: "disabled", configured: false }));
  });
});
