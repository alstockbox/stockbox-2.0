import { afterEach, describe, expect, it, vi } from "vitest";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Yahoo market symbol identity", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fails closed when Yahoo chart metadata identifies a different security", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      chart: {
        result: [{
          meta: {
            symbol: "MSFT",
            currency: "USD",
            regularMarketPrice: 200,
          },
          timestamp: [1_735_689_600],
          indicators: {
            quote: [{ close: [200], volume: [1_000] }],
            adjclose: [{ adjclose: [200] }],
          },
        }],
        error: null,
      },
    }));

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker: "AAPL",
      canonicalTicker: "AAPL",
      name: "Apple Inc.",
      currency: "USD",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/symbol|identity|security/i);
  });
});
