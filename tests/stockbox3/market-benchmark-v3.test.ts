import { describe, expect, it } from "vitest";
import {
  benchmarkForCompanyV3,
  benchmarkForRecommendationOutcomeV3,
} from "@/lib/analysis/market-benchmark-v3";
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

  it("keeps listing-market benchmarks for ordinary companies and investment companies", () => {
    expect(benchmarkForRecommendationOutcomeV3(
      company({ ticker: "MSFT", country: "US", exchange: "NASDAQ" }),
      "standard",
    )).toEqual(expect.objectContaining({ ticker: "^GSPC" }));

    expect(benchmarkForRecommendationOutcomeV3(
      company({ ticker: "INVE-B.ST", canonicalTicker: "INVE-B.ST", country: "SE" }),
      "holding_company",
    )).toEqual(expect.objectContaining({ ticker: "^OMX" }));
  });

  it("never infers ETF economic exposure from the listing venue", () => {
    const usListedFund = company({
      ticker: "FUND",
      country: "US",
      exchange: "NYSE ARCA",
      securityType: "ETF/Fund",
    });
    const etfArchetypes = [
      "etf:equity_etf",
      "etf:index_etf",
      "etf:sector_etf",
      "etf:factor_etf",
      "etf:bond_etf",
      "etf:commodity_etf",
      "etf:leveraged_inverse_etf",
      "etf:unknown_etf",
    ];

    for (const archetype of etfArchetypes) {
      expect(benchmarkForRecommendationOutcomeV3(usListedFund, archetype)).toBeNull();
    }
  });
});
