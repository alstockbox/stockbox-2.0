import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchSecTickerUniverse: vi.fn() }));

vi.mock("@/lib/data/sec", () => ({ fetchSecTickerUniverse: mocks.fetchSecTickerUniverse }));

import { searchCompanyCatalog } from "../../src/lib/data/company-search";
import { providerDiagnostic, type CompanySearchProvider } from "../../src/lib/data/providers";

function adrProvider(overrides: Record<string, unknown> = {}): CompanySearchProvider {
  return {
    id: "global-adr-provider",
    capabilities: {
      supportedCountries: ["global"],
      supportedExchanges: ["global"],
      supportsFundamentals: true,
      supportsMarketData: true,
      supportsEstimates: false,
    },
    search: vi.fn().mockResolvedValue({
      ok: true,
      data: [{
        ticker: "BABA",
        canonicalTicker: "BABA",
        name: "Alibaba Group Holding Limited American Depositary Shares",
        exchange: "NYSE",
        country: "US",
        securityType: "ADR",
        providerCapabilities: {
          fundamentals: false,
          marketData: true,
          providerIds: ["global-adr-provider"],
        },
        ...overrides,
      }],
      diagnostic: providerDiagnostic("global-adr-provider", "search", "available"),
    }),
  };
}

function exactAdr(results: Awaited<ReturnType<typeof searchCompanyCatalog>>) {
  return results.find((company) => company.canonicalTicker === "BABA" && company.securityType === "ADR");
}

describe("global ADR issuer identity", () => {
  beforeEach(() => {
    mocks.fetchSecTickerUniverse.mockResolvedValue([
      { ticker: "BABA", name: "ALIBABA GROUP HOLDING LIMITED", cik: "0001577552", exchange: "NYSE", country: "US" },
    ]);
  });

  it("uses a unique exact SEC ticker match only as issuer identity and preserves the externally evidenced ADR class", async () => {
    const results = await searchCompanyCatalog("BABA", [adrProvider()]);
    const adr = exactAdr(results);

    expect(adr).toEqual(expect.objectContaining({
      ticker: "BABA",
      canonicalTicker: "BABA",
      securityType: "ADR",
      primarySecurity: false,
      cik: "0001577552",
      issuerId: "sec:0001577552",
      entityId: "sec:0001577552",
      providerCapabilities: expect.objectContaining({
        fundamentals: false,
        marketData: true,
        providerIds: expect.arrayContaining(["global-adr-provider", "sec-ticker-universe"]),
      }),
    }));
    expect(adr?.securityId).toBeUndefined();
    expect(results.filter((company) => company.canonicalTicker === "BABA" && company.matchType?.startsWith("exact_"))).toHaveLength(1);
  });

  it("fails closed when the SEC universe contains more than one CIK for the same exact ADR ticker", async () => {
    mocks.fetchSecTickerUniverse.mockResolvedValue([
      { ticker: "BABA", name: "ALIBABA GROUP HOLDING LIMITED", cik: "0001577552", exchange: "NYSE", country: "US" },
      { ticker: "BABA", name: "CONFLICTING REGISTRANT", cik: "0001999999", exchange: "NYSE", country: "US" },
    ]);

    const adr = exactAdr(await searchCompanyCatalog("BABA", [adrProvider()]));

    expect(adr).toEqual(expect.objectContaining({ securityType: "ADR" }));
    expect(adr?.cik).toBeUndefined();
    expect(adr?.issuerId).toBeUndefined();
    expect(adr?.securityId).toBeUndefined();
  });

  it("does not establish SEC issuer identity when the ADR provider supplies a conflicting CIK", async () => {
    const adr = exactAdr(await searchCompanyCatalog("BABA", [adrProvider({ cik: "0001999999" })]));

    expect(adr).toEqual(expect.objectContaining({ cik: "0001999999", securityType: "ADR" }));
    expect(adr?.issuerId).toBeUndefined();
    expect(adr?.securityId).toBeUndefined();
  });
});
