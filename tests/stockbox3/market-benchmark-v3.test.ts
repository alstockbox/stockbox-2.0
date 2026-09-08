import { describe, expect, it } from "vitest";
import { benchmarkForCompanyV3 } from "@/lib/analysis/market-benchmark-v3";
import type { CompanySearchResult } from "@/lib/analysis/types";

function company(overrides: Partial<CompanySearchResult>): CompanySearchResult {
  return {
    ticker: "TEST",
    name: "Test Company",
    ...overrides,
  };
}

describe("Market benchmark policy V3", () => {
  it("maps Swedish securities to the Swedish broad market benchmark", () => {
    expect(benchmarkForCompanyV3(company({ ticker: "INVE-B.ST", canonicalTicker: "INVE-B.ST", country: "SE" })))
      .toEqual(expect.objectContaining({ ticker: "^OMX", market: "Sweden", source: "ticker_suffix" }));
  });

  it("maps US securities to the S&P 500 benchmark", () => {
    expect(benchmarkForCompanyV3(company({ ticker: "MSFT", country: "US", exchange: "NASDAQ" })))
      .toEqual(expect.objectContaining({ ticker: "^GSPC", market: "United States" }));
  });

  it("prefers an explicit ticker suffix over conflicting country metadata", () => {
    expect(benchmarkForCompanyV3(company({ ticker: "SAP.DE", canonicalTicker: "SAP.DE", country: "US" })))
      .toEqual(expect.objectContaining({ ticker: "^GDAXI", market: "Germany", source: "ticker_suffix" }));
  });

  it("can fall back to exchange metadata", () => {
    expect(benchmarkForCompanyV3(company({ ticker: "ABC", country: undefined, exchange: "NYSE" })))
      .toEqual(expect.objectContaining({ ticker: "^GSPC", source: "exchange" }));
  });

  it("fails closed when the listing market cannot be identified", () => {
    expect(benchmarkForCompanyV3(company({ ticker: "MYSTERY", country: undefined, exchange: undefined }))).toBeNull();
  });
});
