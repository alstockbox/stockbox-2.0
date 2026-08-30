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

  it("uses the latest usable history quote when chart metadata is older than the history", async () => {
    const staleMetaTime = Math.floor(Date.parse("2024-01-05T21:00:00Z") / 1000);
    const timestamps = [
      Math.floor(Date.parse("2024-01-05T21:00:00Z") / 1000),
      Math.floor(Date.parse("2024-01-20T21:00:00Z") / 1000),
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      chart: {
        result: [{
          meta: {
            currency: "USD",
            regularMarketTime: staleMetaTime,
            regularMarketPrice: 10.5,
            regularMarketVolume: 500,
          },
          timestamp: timestamps,
          indicators: {
            quote: [{ close: [10.5, 10], volume: [500, 200] }],
            adjclose: [{ adjclose: [10.5, 10] }],
          },
        }],
        error: null,
      },
    }));

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker: "NIMU",
      canonicalTicker: "NIMU",
      name: "Non-Invasive Monitoring Systems Inc",
      currency: "USD",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.price).toBe(10);
    expect(result.data.date).toBe("2024-01-20");
    expect(result.data.volume).toBe(200);
  });

  it("rejects HTML instead of treating it as market data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>blocked</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));

    const result = await yahooMarketDataProvider.fetchMarketData({ ticker: "AAPL", name: "Apple" });
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "html_response" }));
  });

  it("returns timeout when a Yahoo chart request exceeds the provider deadline", async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
        observedSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          observedSignal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      });

      const pending = yahooMarketDataProvider.fetchMarketData({ ticker: "AAPL", name: "Apple" });
      await vi.runOnlyPendingTimersAsync();
      const result = await Promise.race([pending, Promise.resolve("still_pending" as const)]);

      expect(observedSignal?.aborted).toBe(true);
      expect(result).toEqual(expect.objectContaining({ ok: false, reason: "timeout" }));
    } finally {
      vi.useRealTimers();
    }
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

  it("derives US beta from exchange metadata when country is missing", async () => {
    const marketReturns = Array.from({ length: 80 }, (_, i) => ((i % 9) - 4) * 0.004 + 0.001);
    const prices = (scale: number) => marketReturns.reduce((rows, ret) => [...rows, rows.at(-1)! * (1 + ret * scale)], [100]);
    const timestamps = Array.from({ length: 81 }, (_, i) => 1_688_601_600 + i * 7 * 86_400);
    const payload = (closes: number[]) => json({ chart: { result: [{ meta: { currency: "USD", regularMarketPrice: closes.at(-1) }, timestamp: timestamps, indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }], adjclose: [{ adjclose: closes }] } }], error: null } });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(payload(prices(0.8)))
      .mockResolvedValueOnce(payload(prices(1)));
    const result = await yahooMarketDataProvider.fetchMarketData({ ticker: "FRSH", canonicalTicker: "FRSH", name: "Freshworks Inc.", exchange: "NASDAQ", currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.beta).toBeCloseTo(0.8, 2);
    expect(result.data.betaBenchmark).toBe("^GSPC");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("%5EGSPC");
  });

  it.each([
    ["OTC QX exchange code", { ticker: "CCFN", canonicalTicker: "CCFN", name: "Muncy Columbia Financial Corporation", exchange: "OQX" }, "^GSPC"],
    ["OTC QB exchange code", { ticker: "PRKR", canonicalTicker: "PRKR", name: "ParkerVision, Inc.", exchange: "OQB" }, "^GSPC"],
    ["other OTC exchange code", { ticker: "PFBN", canonicalTicker: "PFBN", name: "Pacific Alliance Bank", exchange: "OID" }, "^GSPC"],
    ["BATS exchange display", { ticker: "CBOE", canonicalTicker: "CBOE", name: "Cboe Global Markets, Inc.", exchange: "BATS Trading" }, "^GSPC"],
    ["Frankfurt suffix", { ticker: "RAC.F", canonicalTicker: "RAC.F", name: "Upbound Group, Inc.", exchange: "Frankfurt" }, "^GDAXI"],
    ["Buenos Aires suffix", { ticker: "CSCO.BA", canonicalTicker: "CSCO.BA", name: "Cisco Systems, Inc.", exchange: "Buenos Aires" }, "^MERV"],
  ])("derives beta from %s when country is missing", async (_label, company, expectedBenchmark) => {
    const marketReturns = Array.from({ length: 80 }, (_, i) => ((i % 9) - 4) * 0.004 + 0.001);
    const prices = (scale: number) => marketReturns.reduce((rows, ret) => [...rows, rows.at(-1)! * (1 + ret * scale)], [100]);
    const timestamps = Array.from({ length: 81 }, (_, i) => 1_688_601_600 + i * 7 * 86_400);
    const payload = (closes: number[]) => json({ chart: { result: [{ meta: { currency: "USD", regularMarketPrice: closes.at(-1) }, timestamp: timestamps, indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }], adjclose: [{ adjclose: closes }] } }], error: null } });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(payload(prices(1.1)))
      .mockResolvedValueOnce(payload(prices(1)));
    const result = await yahooMarketDataProvider.fetchMarketData({ ...company, currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.beta).toBeCloseTo(1.1, 2);
    expect(result.data.betaBenchmark).toBe(expectedBenchmark);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(encodeURIComponent(expectedBenchmark));
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
