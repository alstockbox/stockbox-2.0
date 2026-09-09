import { afterEach, describe, expect, it, vi } from "vitest";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Yahoo market benchmark symbol identity", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the primary market snapshot but discards beta from a mismatched benchmark security", async () => {
    const marketReturns = Array.from({ length: 80 }, (_, i) => ((i % 9) - 4) * 0.004 + 0.001);
    const prices = (scale: number) => marketReturns.reduce(
      (rows, ret) => [...rows, rows.at(-1)! * (1 + ret * scale)],
      [100],
    );
    const timestamps = Array.from({ length: 81 }, (_, i) => 1_688_601_600 + i * 7 * 86_400);
    const payload = (symbol: string, closes: number[]) => json({
      chart: {
        result: [{
          meta: { symbol, currency: "USD", regularMarketPrice: closes.at(-1) },
          timestamp: timestamps,
          indicators: {
            quote: [{ close: closes, volume: closes.map(() => 1_000) }],
            adjclose: [{ adjclose: closes }],
          },
        }],
        error: null,
      },
    });

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(payload("AAPL", prices(1.5)))
      .mockResolvedValueOnce(payload("^NDX", prices(1)));

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Apple Inc.",
      country: "US",
      currency: "USD",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.price).toBeGreaterThan(0);
    expect(result.data.beta).toBeNull();
    expect(result.data.betaBenchmark).toBeNull();
    expect(result.data.betaMethod).toBeNull();
    expect(result.data.betaObservationCount).toBeNull();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("%5EGSPC");
  });
});
