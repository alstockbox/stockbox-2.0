import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function yahooSeries(type: string, rows: Array<{ asOfDate: string; periodType: string; currencyCode?: string; value: number }>) {
  return {
    meta: { symbol: ["FIX"], type: [type] },
    [type]: rows.map((row) => ({
      asOfDate: row.asOfDate,
      periodType: row.periodType,
      currencyCode: row.currencyCode ?? "USD",
      reportedValue: { raw: row.value, fmt: String(row.value) },
    })),
  };
}

describe("Yahoo historical valuation provider inputs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests quarterly diluted EPS and builds only cadence-valid rolling TTM EPS", async () => {
    const quarterRows = [
      { asOfDate: "2025-03-31", periodType: "3M", value: 1.0 },
      { asOfDate: "2025-06-30", periodType: "3M", value: 1.1 },
      { asOfDate: "2025-09-30", periodType: "3M", value: 1.2 },
      { asOfDate: "2025-12-31", periodType: "3M", value: 1.3 },
      { asOfDate: "2026-03-31", periodType: "3M", value: 1.4 },
    ];
    const fundamentalsPayload = {
      timeseries: { result: [
        yahooSeries("annualTotalRevenue", [{ asOfDate: "2025-12-31", periodType: "12M", value: 100 }]),
        yahooSeries("annualNetIncome", [{ asOfDate: "2025-12-31", periodType: "12M", value: 20 }]),
        yahooSeries("annualTotalAssets", [{ asOfDate: "2025-12-31", periodType: "12M", value: 200 }]),
        yahooSeries("quarterlyDilutedEPS", quarterRows),
      ] },
    };
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("fundamentals-timeseries")) return json(fundamentalsPayload);
      return json({ quotes: [{ symbol: "FIX", longname: "Fixture Corp", sector: "Technology", industry: "Software" }] });
    }));

    const result = await fetchYahooFundamentalsResult({ ticker: "FIX", canonicalTicker: "FIX", name: "Fixture Corp", country: "US", currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(requestedUrls.find((url) => url.includes("fundamentals-timeseries"))).toContain("quarterlyDilutedEPS");
    expect(result.data.historicalTtmEps).toHaveLength(2);
    expect(result.data.historicalTtmEps?.[0]).toEqual(expect.objectContaining({
      periodEndDate: "2025-12-31",
      epsDiluted: 4.6,
      basis: "TTM_FROM_QUARTERS",
    }));
    expect(result.data.historicalTtmEps?.[1]?.epsDiluted).toBeCloseTo(5, 8);
    expect(result.data.historicalTtmEps?.[1]?.provenance.inputs).toHaveLength(4);
  });

  it("does not construct TTM EPS across a missing-quarter gap", async () => {
    const fundamentalsPayload = {
      timeseries: { result: [
        yahooSeries("annualTotalRevenue", [{ asOfDate: "2025-12-31", periodType: "12M", value: 100 }]),
        yahooSeries("annualNetIncome", [{ asOfDate: "2025-12-31", periodType: "12M", value: 20 }]),
        yahooSeries("annualTotalAssets", [{ asOfDate: "2025-12-31", periodType: "12M", value: 200 }]),
        yahooSeries("quarterlyDilutedEPS", [
          { asOfDate: "2024-12-31", periodType: "3M", value: 1 },
          { asOfDate: "2025-03-31", periodType: "3M", value: 1 },
          { asOfDate: "2025-09-30", periodType: "3M", value: 1 },
          { asOfDate: "2025-12-31", periodType: "3M", value: 1 },
        ]),
      ] },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => String(input).includes("fundamentals-timeseries")
      ? json(fundamentalsPayload)
      : json({ quotes: [{ symbol: "FIX", longname: "Fixture Corp" }] })));
    const result = await fetchYahooFundamentalsResult({ ticker: "FIX", name: "Fixture Corp", country: "US", currency: "USD" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.historicalTtmEps).toEqual([]);
  });

  it("parses Yahoo dividend and split events while retaining adjusted price history", async () => {
    const timestamps = [
      Math.floor(Date.parse("2025-12-31T21:00:00Z") / 1000),
      Math.floor(Date.parse("2026-01-30T21:00:00Z") / 1000),
    ];
    const dividendTs = Math.floor(Date.parse("2026-01-15T12:00:00Z") / 1000);
    const splitTs = Math.floor(Date.parse("2026-01-20T12:00:00Z") / 1000);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("%5EGSPC") || url.includes("^GSPC")) return json({ chart: { result: null, error: { code: "Not Found" } } });
      return json({ chart: { result: [{
        meta: { currency: "USD", regularMarketPrice: 51, regularMarketVolume: 1000 },
        timestamp: timestamps,
        indicators: {
          quote: [{ close: [100, 102], volume: [1000, 1000] }],
          adjclose: [{ adjclose: [50, 51] }],
        },
        events: {
          dividends: { [String(dividendTs)]: { amount: 0.25, date: dividendTs } },
          splits: { [String(splitTs)]: { date: splitTs, numerator: 2, denominator: 1, splitRatio: "2:1" } },
        },
      }], error: null } });
    }));

    const result = await yahooMarketDataProvider.fetchMarketData({ ticker: "FIX", canonicalTicker: "FIX", name: "Fixture Corp", country: "US", currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.priceHistoryBasis).toBe("adjusted_close");
    expect(result.data.priceHistory?.at(-1)?.close).toBe(51);
    expect(result.data.dividendEvents).toEqual([expect.objectContaining({ date: "2026-01-15", amount: 0.25, currency: "USD" })]);
    expect(result.data.splitEvents).toEqual([expect.objectContaining({ date: "2026-01-20", numerator: 2, denominator: 1, splitRatio: 2 })]);
  });
});
