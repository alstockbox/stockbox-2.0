import { afterEach, describe, expect, it, vi } from "vitest";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";
import { createTwelveDataMarketProvider } from "../../src/lib/data/twelve-data";
import { fetchStooqMarketData } from "../../src/lib/data/stooq";
import type { MarketPricePoint } from "../../src/lib/analysis/types";

type CurrencyPricePoint = MarketPricePoint & { currency?: string | null; provider?: string };

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("market history currency provenance P0", () => {
  afterEach(() => vi.restoreAllMocks());

  it("attaches Yahoo quote currency to every historical price point", async () => {
    const timestamps = [
      Math.floor(Date.parse("2026-07-31T16:00:00Z") / 1000),
      Math.floor(Date.parse("2026-08-31T16:00:00Z") / 1000),
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      chart: {
        result: [{
          meta: { currency: "SEK", regularMarketPrice: 413.1, regularMarketVolume: 1000 },
          timestamp: timestamps,
          indicators: {
            quote: [{ close: [390, 413.1], volume: [900, 1000] }],
            adjclose: [{ adjclose: [390, 413.1] }],
          },
        }],
        error: null,
      },
    }));

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker: "INVE-B.ST",
      canonicalTicker: "INVE-B.ST",
      name: "Investor AB",
      country: "SE",
      currency: "SEK",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.currency).toBe("SEK");
    expect(result.data.priceHistory?.length).toBeGreaterThan(0);
    expect((result.data.priceHistory as CurrencyPricePoint[]).every((point) => point.currency === "SEK")).toBe(true);
  });

  it("keeps a long, currency-tagged history when Twelve Data is the market fallback", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/quote")) {
        return json({ close: "417.2", currency: "SEK", datetime: "2026-08-31", volume: "1000" });
      }
      if (url.pathname.endsWith("/time_series")) {
        return json({ values: [
          { datetime: "2024-12-30", close: "300", volume: "900" },
          { datetime: "2025-12-30", close: "350", volume: "950" },
          { datetime: "2026-08-31", close: "417.2", volume: "1000" },
        ] });
      }
      if (url.pathname.endsWith("/statistics")) return json({});
      return json({}, 404);
    });

    const result = await createTwelveDataMarketProvider("test-key").fetchMarketData({
      ticker: "INVE-B.ST",
      canonicalTicker: "INVE-B.ST",
      name: "Investor AB",
      country: "SE",
      currency: "SEK",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const historyUrl = fetchMock.mock.calls.map(([input]) => new URL(String(input))).find((url) => url.pathname.endsWith("/time_series"));
    expect(historyUrl?.searchParams.get("outputsize")).toBe("5000");
    expect(result.data.priceHistory?.length).toBeGreaterThan(0);
    expect((result.data.priceHistory as CurrencyPricePoint[]).every((point) => point.currency === "SEK")).toBe(true);
  });

  it("retains USD price history when Stooq is the US fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response([
      "Date,Open,High,Low,Close,Volume",
      "2026-07-31,100,101,99,100,1000",
      "2026-08-31,110,111,109,110,1200",
    ].join("\n"), { status: 200, headers: { "content-type": "text/csv" } }));

    const result = await fetchStooqMarketData({ ticker: "AAPL", name: "Apple Inc.", country: "US", currency: "USD" }, { retries: 0 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.priceHistory?.length).toBeGreaterThan(0);
    expect((result.data.priceHistory as CurrencyPricePoint[]).every((point) => point.currency === "USD")).toBe(true);
  });
});