import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const company: CompanySearchResult = {
  ticker: "VOLV-B.ST",
  canonicalTicker: "VOLV-B.ST",
  name: "AB Volvo B",
  exchange: "STO",
  country: "SE",
  currency: "SEK",
  securityType: "Common Stock",
};

const mismatchedTimeseriesPayload = {
  timeseries: {
    result: [{
      meta: { symbol: ["WRONG.ST"], type: ["annualTotalRevenue"] },
      annualTotalRevenue: [{
        asOfDate: "2025-12-31",
        periodType: "12M",
        currencyCode: "SEK",
        reportedValue: { raw: 479_183, fmt: "479183" },
      }],
    }],
  },
};

const metadataPayload = {
  quotes: [{
    symbol: "VOLV-B.ST",
    sector: "Industrials",
    industry: "Farm & Heavy Construction Machinery",
    longname: "AB Volvo (publ)",
  }],
};

describe("Yahoo fundamentals provider identity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when the fundamentals timeseries payload belongs to a different Yahoo symbol", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const payload = String(input).includes("fundamentals-timeseries")
        ? mismatchedTimeseriesPayload
        : metadataPayload;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_row");
    expect(result.message).toMatch(/symbol|identity|ticker/i);
  });
});
