import { afterEach, describe, expect, it, vi } from "vitest";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Yahoo chart market adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns adjusted daily history, momentum and quote metadata without an API key", async () => {
    const timestamps = Array.from({ length: 400 }, (_, index) => 1_735_689_600 + index * 86_400);
    const closes = Array.from({ length: 400 }, (_, index) => 100 + index);
    const volumes = Array.from({ length: 400 }, () => 1_000_000);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      chart: {
        result: [{
          meta: {
            currency: "USD",
            regularMarketPrice: 359,
            regularMarketVolume: 2_000_000,
            fiftyTwoWeekHigh: 370,
            fiftyTwoWeekLow: 120,
          },
          timestamp: timestamps,
          indicators: {
            quote: [{ close: closes, volume: volumes }],
            adjclose: [{ adjclose: closes }],
          },
        }],
        error: null,
      },
    }));

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Apple Inc.",
      country: "US",
      currency: "USD",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(expect.objectContaining({
      ticker: "AAPL",
      price: 359,
      currency: "USD",
      volume: 2_000_000,
      yearHigh: 370,
      yearLow: 120,
      provider: "yahoo-chart",
      historyLength: 400,
    }));
    expect(result.data.performance["3M"]).toBeTypeOf("number");
    expect(result.data.performance["1Y"]).toBeTypeOf("number");
  });

  it("rejects HTML instead of treating it as market data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>blocked</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));

    const result = await yahooMarketDataProvider.fetchMarketData({ ticker: "AAPL", name: "Apple" });
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "html_response" }));
  });

  it("maps US dotted share classes to Yahoo hyphen tickers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ chart: { result: null, error: { code: "Not Found" } } }));
    await yahooMarketDataProvider.fetchMarketData({ ticker: "BRK.B", canonicalTicker: "BRK.B", name: "Berkshire Hathaway B", country: "US" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("BRK-B");
  });

  it("maps StockBox Stockholm tickers to Yahoo's Stockholm suffix", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ chart: { result: null, error: { code: "Not Found" } } }));
    await yahooMarketDataProvider.fetchMarketData({ ticker: "VOLV B", canonicalTicker: "VOLV-B.ST", name: "Volvo B", country: "SE" });
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("VOLV-B.ST");
  });
});
