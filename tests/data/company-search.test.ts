import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchSecTickerUniverse: vi.fn() }));

vi.mock("@/lib/data/sec", () => ({ fetchSecTickerUniverse: mocks.fetchSecTickerUniverse }));

import { normalizedTicker, searchCompanyCatalog } from "../../src/lib/data/company-search";
import { providerDiagnostic, type CompanySearchProvider } from "../../src/lib/data/providers";
import { swedishSecurityMasterProvider } from "../../src/lib/data/security-master";

const stockholmTickerCollisions = [
  ["EVO.ST", "Evolution"],
  ["EQT.ST", "EQT"],
  ["CAST.ST", "Castellum"],
  ["MIR.ST", "Miris Holding"],
  ["META.ST", "Metacon"],
  ["NIO.ST", "Nordic Iron Ore"],
  ["ACAD.ST", "AcadeMedia"],
  ["BILL.ST", "Billerud"],
  ["HUM.ST", "Humana"],
  ["PDX.ST", "Paradox Interactive"],
] as const;

function tickerRoot(ticker: string): string {
  return normalizedTicker(ticker.replace(/\.(ST|SS)$/i, ""));
}

describe("company search catalog", () => {
  beforeEach(() => {
    mocks.fetchSecTickerUniverse.mockResolvedValue([
      { ticker: "NVDA", name: "NVIDIA CORP", cik: "0001045810", exchange: "NASDAQ", country: "US" },
      { ticker: "JPM", name: "JPMORGAN CHASE & CO", cik: "0000019617", exchange: "NYSE", country: "US" },
      { ticker: "JPM-PC", name: "JPMorgan Chase Preferred Depositary Shares Series C", cik: "0000019617", exchange: "NYSE", country: "US" },
      { ticker: "JPM-PD", name: "JPMorgan Chase Preferred Depositary Shares", cik: "0000019617", exchange: "NYSE", country: "US" },
      { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", exchange: "NASDAQ", country: "US" },
      { ticker: "GOOG", name: "Alphabet Inc. Class C", cik: "0001652044", exchange: "NASDAQ", country: "US" },
      { ticker: "GOOGL", name: "Alphabet Inc. Class A", cik: "0001652044", exchange: "NASDAQ", country: "US" },
      { ticker: "NNN", name: "NNN REIT, INC.", cik: "0000751364", exchange: "NYSE", country: "US" },
      { ticker: "O", name: "REALTY INCOME CORP", cik: "0000726728", exchange: "NYSE", country: "US" },
      { ticker: "PLD", name: "Prologis, Inc.", cik: "0001045609", exchange: "NYSE", country: "US" },
      { ticker: "AHR", name: "American Healthcare REIT, Inc.", cik: "0001632970", exchange: "NYSE", country: "US" },
      { ticker: "EVO", name: "Evotec SE", cik: "0001806949", exchange: "NASDAQ", country: "US" },
      { ticker: "EQT", name: "EQT Corporation", cik: "0000033213", exchange: "NYSE", country: "US" },
      { ticker: "CAST", name: "FreeCast, Inc.", cik: "0001905660", exchange: "OTC", country: "US" },
      { ticker: "MIR", name: "Mirion Technologies, Inc.", cik: "0001809987", exchange: "NYSE", country: "US" },
      { ticker: "NIO", name: "NIO Inc.", cik: "0001736541", exchange: "NYSE", country: "US" },
      { ticker: "ACAD", name: "ACADIA Pharmaceuticals Inc.", cik: "0001070494", exchange: "NASDAQ", country: "US" },
      { ticker: "BILL", name: "BILL Holdings, Inc.", cik: "0001786352", exchange: "NYSE", country: "US" },
      { ticker: "HUM", name: "Humana Inc.", cik: "0000049071", exchange: "NYSE", country: "US" },
      { ticker: "PDX", name: "PIMCO Dynamic Income Strategy Fund", cik: "0001848753", exchange: "NYSE", country: "US" },
      { ticker: "ZZZZ", name: "Unverified SEC Registrant", cik: "0009999999", exchange: "NYSE", country: "US" },
    ]);
  });

  it.each([
    ["NVDA", "NVDA"],
    ["JPM", "JPM"],
    ["JPM-PC", "JPM-PC"],
    ["JPM-PD", "JPM-PD"],
    ["AAPL", "AAPL"],
    ["Apple", "AAPL"],
    ["Apple Inc", "AAPL"],
    ["appl", "AAPL"],
    ["NVIDIA", "NVDA"],
    ["BRK.B", "BRK.B"],
    ["BRK B", "BRK.B"],
    ["Berkshire", "BRK.B"],
    ["GOOG", "GOOG"],
    ["GOOGL", "GOOGL"],
    ["Google", "GOOGL"],
    ["META", "META"],
    ["Amazon", "AMZN"],
    ["Investor B", "INVE-B.ST"],
    ["INVE.B", "INVE-B.ST"],
    ["INVE B", "INVE-B.ST"],
    ["INVE.B.ST", "INVE-B.ST"],
    ["Investor AB", "INVE.B"],
    ["Volvo", "VOLV-B.ST"],
    ["VOLV-B.ST", "VOLV-B.ST"],
    ["VOLV B", "VOLV-B.ST"],
    ["ERIC-B.ST", "ERIC-B.ST"],
    ["Novo Nordisk", "NOVO-B.CO"],
    ["7203.T", "7203.T"],
    ["RO.SW", "RO.SW"],
    ["NESN.SW", "NESN.SW"],
    ["NOKIA.HE", "NOKIA.HE"],
  ])("ranks %s with canonical ticker %s first", async (query, ticker) => {
    const results = await searchCompanyCatalog(query);
    expect(results[0]?.canonicalTicker).toBe(ticker);
  });

  it("merges duplicate bare US ticker representations when one provider supplies stable SEC identity", async () => {
    mocks.fetchSecTickerUniverse.mockResolvedValue([
      { ticker: "WMT", name: "Walmart Inc.", cik: "0000104169", exchange: "NYSE", country: "US" },
    ]);
    const yahooLikeProvider: CompanySearchProvider = {
      id: "yahoo-like",
      capabilities: {
        supportedCountries: ["global"], supportedExchanges: ["global"],
        supportsFundamentals: true, supportsMarketData: true, supportsEstimates: false,
      },
      search: vi.fn().mockResolvedValue({
        ok: true,
        data: [{
          ticker: "WMT", canonicalTicker: "WMT", name: "Walmart Inc.", exchange: "NASDAQ",
          providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["yahoo-search"] },
        }],
        diagnostic: providerDiagnostic("yahoo-like", "search", "available"),
      }),
    };

    const results = await searchCompanyCatalog("WMT", [yahooLikeProvider]);
    const exactWmt = results.filter((company) => company.canonicalTicker === "WMT" && company.matchType?.startsWith("exact_"));

    expect(exactWmt).toHaveLength(1);
    expect(exactWmt[0]).toEqual(expect.objectContaining({
      cik: "0000104169",
      entityId: "sec:0000104169",
      providerCapabilities: expect.objectContaining({
        providerIds: expect.arrayContaining(["sec-ticker-universe", "yahoo-search"]),
      }),
    }));
  });

  it.each(["ABB", "Novo Nordisk", "Toyota", "ASML", "Nokia"])("keeps ADR and local listings distinct for %s", async (query) => {
    const results = await searchCompanyCatalog(query);
    const identities = new Map<string, string[]>();
    for (const company of results) identities.set(company.entityId ?? "", [...(identities.get(company.entityId ?? "") ?? []), company.ticker]);
    expect([...identities.values()].some((tickers) => tickers.length >= 2)).toBe(true);
  });

  it("does not expose Roche's retired ROG.SW security as an exact current listing", async () => {
    const results = await searchCompanyCatalog("ROG.SW");
    expect(results.some((company) => company.canonicalTicker === "ROG.SW" && company.matchType?.startsWith("exact_"))).toBe(false);
  });

  it("returns ambiguous MICRO candidates without selecting one", async () => {
    const results = await searchCompanyCatalog("MICRO");
    expect(results.map((company) => company.ticker)).toEqual(expect.arrayContaining(["MU", "MCHP"]));
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]).toEqual(expect.objectContaining({ primaryCandidate: false, matchConfidence: "medium" }));
  });

  it("strongly prefers JPM common stock over preferred securities", async () => {
    const results = await searchCompanyCatalog("JPM");
    expect(results[0]).toEqual(expect.objectContaining({ ticker: "JPM", securityType: "Common Stock" }));
    expect(results.findIndex((company) => company.securityType === "Preferred")).toBeGreaterThan(0);
  });

  it("respects explicit preferred-security intent and exact preferred tickers", async () => {
    const preferredResults = await searchCompanyCatalog("JPM preferred");
    expect(preferredResults[0]).toEqual(expect.objectContaining({ securityType: "Preferred" }));

    const exactResults = await searchCompanyCatalog("JPM-PC");
    expect(exactResults[0]).toEqual(expect.objectContaining({
      ticker: "JPM-PC",
      matchType: expect.stringMatching(/^exact_/),
      matchConfidence: "high",
      primaryCandidate: true,
      providerCapabilities: expect.objectContaining({ fundamentals: false }),
    }));
  });

  it("returns transparent ranking metadata without leaking private aliases", async () => {
    const [apple] = await searchCompanyCatalog("Apple");
    expect(apple).toEqual(expect.objectContaining({
      canonicalTicker: "AAPL",
      matchType: "exact_alias",
      matchScore: expect.any(Number),
      matchConfidence: "high",
      matchReasons: expect.arrayContaining(["Exact known alias"]),
      primaryCandidate: true,
    }));
    expect(apple).not.toHaveProperty("searchAliases");
  });

  it("applies provider coverage only after stronger identity matches", async () => {
    const provider: CompanySearchProvider = {
      id: "rich-but-irrelevant",
      capabilities: {
        supportedCountries: ["global"], supportedExchanges: ["global"],
        supportsFundamentals: true, supportsMarketData: true, supportsEstimates: true,
      },
      search: vi.fn().mockResolvedValue({
        ok: true,
        data: [{ ticker: "ZZZ", name: "Unrelated Holdings", country: "US", cik: "0009999999", searchAliases: ["AAPL"] }],
        diagnostic: providerDiagnostic("rich-but-irrelevant", "search", "available"),
      }),
    };
    const results = await searchCompanyCatalog("AAPL", [provider]);
    expect(results[0]?.canonicalTicker).toBe("AAPL");
    expect(results.findIndex((company) => company.ticker === "ZZZ")).toBeGreaterThan(0);
    expect(results[0]!.matchScore).toBeGreaterThan(results.find((company) => company.ticker === "ZZZ")!.matchScore!);
  });

  it("finds curated REIT companies by market category", async () => {
    const results = await searchCompanyCatalog("reit");
    expect(results.map((company) => company.ticker)).toEqual(expect.arrayContaining(["O", "PLD"]));
  });

  it("does not claim SEC fundamentals support for Investor AB", async () => {
    const [investor] = await searchCompanyCatalog("INVE.B");
    expect(investor).toEqual(expect.objectContaining({
      securityId: "xsto:tx76",
      entityId: "issuer:se:investor",
      providerCapabilities: expect.objectContaining({ fundamentals: false }),
    }));
  });

  it("classifies American depositary shares as ADR even when a provider omits securityType", async () => {
    const provider: CompanySearchProvider = {
      id: "global-adr-provider",
      capabilities: {
        supportedCountries: ["global"], supportedExchanges: ["global"],
        supportsFundamentals: true, supportsMarketData: true, supportsEstimates: false,
      },
      search: vi.fn().mockResolvedValue({
        ok: true,
        data: [{
          ticker: "BABA",
          name: "Alibaba Group Holding Limited American Depositary Shares",
          country: "US",
          cik: "0001577552",
        }],
        diagnostic: providerDiagnostic("global-adr-provider", "search", "available"),
      }),
    };

    const [result] = await searchCompanyCatalog("BABA", [provider]);
    expect(result).toEqual(expect.objectContaining({
      ticker: "BABA",
      securityType: "ADR",
      providerCapabilities: expect.objectContaining({ fundamentals: false }),
    }));
  });

  it.each([
    ["Viscaria", "VISC.ST"],
    ["VISC", "VISC.ST"],
    ["visc.st", "VISC.ST"],
    ["Sivers", "SIVE.ST"],
    ["Sivers Semiconductors", "SIVE.ST"],
    ["SIVE", "SIVE.ST"],
    ["sive.st", "SIVE.ST"],
    ["SINCH.ST", "SINCH.ST"],
    ["TEL2-B.ST", "TEL2-B.ST"],
    ["KINV-B.ST", "KINV-B.ST"],
    ["LATO-B.ST", "LATO-B.ST"],
    ["SSAB-A.ST", "SSAB-A.ST"],
    ["BEIJ-B.ST", "BEIJ-B.ST"],
    ["CAST.ST", "CAST.ST"],
    ["FABG.ST", "FABG.ST"],
    ["SEB-A.ST", "SEB-A.ST"],
    ["SHB-A.ST", "SHB-A.ST"],
    ["SWED-A.ST", "SWED-A.ST"],
    ["SKF-B.ST", "SKF-B.ST"],
    ["Atlas Copco B", "ATCO-B.ST"],
    ["ASSA ABLOY B", "ASSA-B.ST"],
    ["Sandvik", "SAND.ST"],
    ["Telia", "TELIA.ST"],
    ["Tele2 B", "TEL2-B.ST"],
    ["Kinnevik B", "KINV-B.ST"],
    ["Latour B", "LATO-B.ST"],
    ["SSAB A", "SSAB-A.ST"],
    ["Beijer Ref B", "BEIJ-B.ST"],
    ["Castellum", "CAST.ST"],
    ["Fabege", "FABG.ST"],
  ])("finds Swedish listed securities by %s", async (query, canonicalTicker) => {
    const [company] = await searchCompanyCatalog(query);
    expect(company).toEqual(expect.objectContaining({
      canonicalTicker,
      country: "SE",
      providerCapabilities: expect.objectContaining({ fundamentals: false, marketData: true }),
      analysisCapability: expect.objectContaining({ fundamentals: "unavailable", marketData: "available" }),
    }));
  });

  it("lets an exact Swedish listed ticker outrank fuzzy US-style candidates", async () => {
    const provider: CompanySearchProvider = {
      id: "fuzzy-global-provider",
      capabilities: {
        supportedCountries: ["global"], supportedExchanges: ["global"],
        supportsFundamentals: true, supportsMarketData: true, supportsEstimates: false,
      },
      search: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { ticker: "FIVE", name: "Five Below, Inc.", country: "US", cik: "0001177609" },
          { ticker: "HIVE", name: "HIVE Digital Technologies Ltd.", country: "CA" },
          { ticker: "LIVE", name: "Live Ventures Incorporated", country: "US" },
        ],
        diagnostic: providerDiagnostic("fuzzy-global-provider", "search", "available"),
      }),
    };

    const results = await searchCompanyCatalog("sive.st", [provider]);
    expect(results[0]).toEqual(expect.objectContaining({
      ticker: "SIVE",
      canonicalTicker: "SIVE.ST",
      matchType: expect.stringMatching(/^exact_/),
      primaryCandidate: true,
    }));
    expect(results[0]?.ticker).not.toBe("FIVE");
  });

  it.each(stockholmTickerCollisions)(
    "keeps exact Stockholm ticker %s above same-root foreign securities",
    async (canonicalTicker, expectedName) => {
      const results = await searchCompanyCatalog(canonicalTicker);
      const root = tickerRoot(canonicalTicker);

      expect(results[0]).toEqual(expect.objectContaining({
        canonicalTicker,
        country: "SE",
        name: expect.stringContaining(expectedName),
        matchType: expect.stringMatching(/^exact_/),
        matchConfidence: "high",
        primaryCandidate: true,
      }));
      expect(results.findIndex((company) =>
        company.country !== "SE" && normalizedTicker(company.ticker) === root
      )).toBeGreaterThan(0);
    },
  );

  it("keeps generated Swedish collision tickers covered by exact-routing regression", async () => {
    const securities = await swedishSecurityMasterProvider.listSecurities();
    const canonicalByRoot = new Map(securities.map((security) => [tickerRoot(security.canonicalTicker), security.canonicalTicker]));

    expect(stockholmTickerCollisions.map(([canonicalTicker]) => canonicalByRoot.get(tickerRoot(canonicalTicker)))).toEqual(
      stockholmTickerCollisions.map(([canonicalTicker]) => canonicalTicker),
    );
  });

  it.each([
    ["NNN", "0000751364"],
    ["O", "0000726728"],
    ["PLD", "0001045609"],
    ["AHR", "0001632970"],
    ["NVDA", "0001045810"],
    ["JPM", "0000019617"],
    ["AAPL", "0000320193"],
  ])("propagates SEC fundamentals capability for %s", async (ticker, cik) => {
    const [company] = await searchCompanyCatalog(ticker);
    expect(company).toEqual(expect.objectContaining({
      cik,
      providerCapabilities: expect.objectContaining({
        fundamentals: true,
        providerIds: expect.arrayContaining(["sec-companyfacts", "sec-ticker-universe"]),
      }),
    }));
  });
});
