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
  it("derives auditable weekly beta against the US market benchmark", async () => {
    const marketReturns = Array.from({ length: 80 }, (_, i) => ((i % 9) - 4) * 0.004 + 0.001);
    const prices = (scale: number) => marketReturns.reduce((rows, ret) => [...rows, rows.at(-1)! * (1 + ret * scale)], [100]);
    const timestamps = Array.from({ length: 81 }, (_, i) => 1_688_601_600 + i * 7 * 86_400);
    const payload = (closes: number[]) => json({ chart: { result: [{ meta: { currency: "USD", regularMarketPrice: closes.at(-1) }, timestamp: timestamps, indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }], adjclose: [{ adjclose: closes }] } }], error: null } });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(payload(prices(1.5)))
      .mockResolvedValueOnce(payload(prices(1)));
    const result = await yahooMarketDataProvider.fetchMarketData({ ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", country: "US", currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.beta).toBeCloseTo(1.5, 2);
    expect(result.data.betaBenchmark).toBe("^GSPC");
    expect(result.data.betaMethod).toBe("historical_weekly_regression");
    expect(result.data.betaObservationCount).toBeGreaterThanOrEqual(52);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("%5EGSPC");
  });

  it("keeps beta unavailable when benchmark overlap is shorter than one year", async () => {
    const timestamps = Array.from({ length: 30 }, (_, i) => 1_720_742_400 + i * 7 * 86_400);
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ chart: { result: [{ meta: { currency: "USD", regularMarketPrice: closes.at(-1) }, timestamp: timestamps, indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }], adjclose: [{ adjclose: closes }] } }], error: null } }));
    const result = await yahooMarketDataProvider.fetchMarketData({ ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", country: "US", currency: "USD" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.beta).toBeNull();
  });

  it("rejects beta when the benchmark overlap is materially stale", async () => {
    const returns = Array.from({ length: 100 }, (_, i) => ((i % 7) - 3) * 0.005 + 0.001);
    const prices = returns.reduce((rows, ret) => [...rows, rows.at(-1)! * (1 + ret)], [100]);
    const timestamps = Array.from({ length: 101 }, (_, i) => 1_669_852_800 + i * 7 * 86_400);
    const payload = (ts: number[], closes: number[]) => json({ chart: { result: [{ meta: { currency: "USD", regularMarketPrice: closes.at(-1) }, timestamp: ts, indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }], adjclose: [{ adjclose: closes }] } }], error: null } });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(payload(timestamps, prices))
      .mockResolvedValueOnce(payload(timestamps.slice(0, 81), prices.slice(0, 81)));
    const result = await yahooMarketDataProvider.fetchMarketData({ ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", country: "US", currency: "USD" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.beta).toBeNull();
  });

});
