import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const company: CompanySearchResult = {
  ticker: "BRK.B",
  canonicalTicker: "BRK.B",
  name: "Berkshire B",
  exchange: "NYSE",
  currency: "USD",
  securityType: "Common Stock",
};

const timeseriesPayload = {
  timeseries: {
    result: [{
      meta: { symbol: ["BRK-B"], type: ["annualTotalRevenue"] },
      annualTotalRevenue: [{
        asOfDate: "2025-12-31",
        periodType: "12M",
        currencyCode: "USD",
        reportedValue: { raw: 1, fmt: "1" },
      }],
    }],
  },
};

const metadataPayload = {
  quotes: [{
    symbol: "BRK-B",
    sector: "Financial Services",
    industry: "Insurance - Diversified",
    longname: "Berkshire Hathaway Inc. Class B",
  }],
};

describe("Yahoo fundamentals metadata symbol identity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts an equivalent Yahoo class-share symbol when selecting metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const payload = String(input).includes("fundamentals-timeseries")
        ? timeseriesPayload
        : metadataPayload;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));

    const result = await fetchYahooFundamentalsResult(company);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe("Berkshire Hathaway Inc. Class B");
    expect(result.data.sector).toBe("financials");
  });
});
