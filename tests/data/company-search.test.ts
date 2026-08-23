import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchSecTickerUniverse: vi.fn() }));

vi.mock("@/lib/data/sec", () => ({ fetchSecTickerUniverse: mocks.fetchSecTickerUniverse }));

import { searchCompanyCatalog } from "../../src/lib/data/company-search";

describe("company search catalog", () => {
  beforeEach(() => {
    mocks.fetchSecTickerUniverse.mockResolvedValue([
      { ticker: "NVDA", name: "NVIDIA CORP", cik: "0001045810", exchange: "NASDAQ", country: "US" },
      { ticker: "JPM", name: "JPMORGAN CHASE & CO", cik: "0000019617", exchange: "NYSE", country: "US" },
      { ticker: "JPM-PD", name: "JPMorgan Chase Preferred Depositary Shares", cik: "0000019617", exchange: "NYSE", country: "US" },
      { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", exchange: "NASDAQ", country: "US" },
      { ticker: "ZZZZ", name: "Unverified SEC Registrant", cik: "0009999999", exchange: "NYSE", country: "US" },
    ]);
  });

  it.each([
    ["NVDA", "NVDA"],
    ["JPM", "JPM"],
    ["AAPL", "AAPL"],
    ["Apple", "AAPL"],
    ["Investor B", "INVE.B"],
    ["INVE.B", "INVE.B"],
    ["INVE B", "INVE.B"],
  ])("ranks %s with canonical ticker %s first", async (query, ticker) => {
    const results = await searchCompanyCatalog(query);
    expect(results[0]?.canonicalTicker).toBe(ticker);
  });

  it("strongly prefers JPM common stock over preferred securities", async () => {
    const results = await searchCompanyCatalog("JPM");
    expect(results[0]).toEqual(expect.objectContaining({ ticker: "JPM", securityType: "Common Stock" }));
    expect(results.findIndex((company) => company.securityType === "Preferred")).toBeGreaterThan(0);
  });

  it("finds curated REIT companies by market category", async () => {
    const results = await searchCompanyCatalog("reit");
    expect(results.map((company) => company.ticker)).toEqual(expect.arrayContaining(["O", "PLD"]));
  });

  it("does not claim SEC fundamentals support for Investor AB", async () => {
    const [investor] = await searchCompanyCatalog("INVE.B");
    expect(investor).toEqual(expect.objectContaining({
      entityId: "listing:SE:INVE.B",
      providerCapabilities: expect.objectContaining({ fundamentals: false }),
    }));
  });

  it("does not claim fundamentals support merely because SEC search returns a CIK", async () => {
    const [unverified] = await searchCompanyCatalog("ZZZZ");
    expect(unverified).toEqual(expect.objectContaining({
      cik: "0009999999",
      providerCapabilities: expect.objectContaining({ fundamentals: false }),
    }));
  });
});
