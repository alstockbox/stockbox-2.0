import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchSecTickerUniverse: vi.fn() }));
vi.mock("@/lib/data/sec", () => ({ fetchSecTickerUniverse: mocks.fetchSecTickerUniverse }));

import { searchCompanyCatalog } from "../../src/lib/data/company-search";
import { providerDiagnostic, type CompanySearchProvider } from "../../src/lib/data/providers";

const liveProvider: CompanySearchProvider = {
  id: "global-live-provider",
  capabilities: {
    supportedCountries: ["global"], supportedExchanges: ["global"],
    supportsFundamentals: true, supportsMarketData: true, supportsEstimates: false,
  },
  search: vi.fn().mockResolvedValue({
    ok: true,
    data: [{
      ticker: "TRUE-B.ST", canonicalTicker: "TRUE-B.ST",
      name: "Truecaller AB (publ)", exchange: "Stockholm", country: "SE",
      securityType: "Common Stock",
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["yahoo-fundamentals"] },
    }],
    diagnostic: providerDiagnostic("global-live-provider", "search", "available"),
  }),
};

const broadUsProvider: CompanySearchProvider = {
  id: "broad-us-provider",
  capabilities: {
    supportedCountries: ["US"], supportedExchanges: ["NYSE"],
    supportsFundamentals: true, supportsMarketData: true, supportsEstimates: false,
  },
  search: vi.fn().mockResolvedValue({
    ok: true,
    data: [{
      ticker: "ZXQY", canonicalTicker: "ZXQY",
      name: "Example Holdings plc", exchange: "NYSE",
      securityType: "Common Stock",
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["broad-live-data"] },
    }],
    diagnostic: providerDiagnostic("broad-us-provider", "search", "available"),
  }),
};

const explicitAdrProvider: CompanySearchProvider = {
  id: "explicit-adr-provider",
  capabilities: {
    supportedCountries: ["US"], supportedExchanges: ["NYSE"],
    supportsFundamentals: false, supportsMarketData: true, supportsEstimates: false,
  },
  search: vi.fn().mockResolvedValue({
    ok: true,
    data: [{
      ticker: "ZXQY", canonicalTicker: "ZXQY",
      name: "Example Holdings plc ADR", country: "US", exchange: "NYSE",
      securityType: "ADR",
      primarySecurity: false,
      providerCapabilities: { fundamentals: false, marketData: true, providerIds: ["verified-security-identity"] },
    }],
    diagnostic: providerDiagnostic("explicit-adr-provider", "search", "available"),
  }),
};

describe("company search capability merge", () => {
  beforeEach(() => mocks.fetchSecTickerUniverse.mockResolvedValue([]));

  it("merges duplicate representations of the same exchange-qualified common stock", async () => {
    const results = await searchCompanyCatalog("TRUE-B.ST", [liveProvider]);
    const truecaller = results.filter((item) => item.canonicalTicker === "TRUE-B.ST");

    expect(truecaller).toHaveLength(1);
    expect(truecaller[0]).toEqual(expect.objectContaining({
      securityId: "xsto:tx3991356",
      issuerId: "issuer:se:truecaller",
      canonicalTicker: "TRUE-B.ST",
      providerCapabilities: expect.objectContaining({
        fundamentals: true,
        marketData: true,
      }),
    }));
    expect(truecaller[0]?.providerCapabilities?.providerIds).toEqual(
      expect.arrayContaining(["swedish-listed-security-master", "global-live-provider", "yahoo-fundamentals"]),
    );
    expect(truecaller[0]?.providerCapabilities?.providerIds).not.toContain("sec-companyfacts");
  });

  it("merges one exact US listing when a broad provider calls it common stock but another explicitly identifies an ADR", async () => {
    const results = await searchCompanyCatalog("ZXQY", [broadUsProvider, explicitAdrProvider]);
    const exact = results.filter((item) => item.canonicalTicker === "ZXQY");

    expect(exact).toHaveLength(1);
    expect(exact[0]).toEqual(expect.objectContaining({
      canonicalTicker: "ZXQY",
      securityType: "ADR",
      providerCapabilities: expect.objectContaining({
        fundamentals: true,
        marketData: true,
      }),
    }));
    expect(exact[0]?.providerCapabilities?.providerIds).toEqual(expect.arrayContaining([
      "broad-us-provider",
      "broad-live-data",
      "explicit-adr-provider",
      "verified-security-identity",
    ]));
  });
});
