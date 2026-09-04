import { afterEach, describe, expect, it, vi } from "vitest";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market-core";

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function weeklyPayload(scale: number) {
  const marketReturns = Array.from({ length: 80 }, (_, index) => ((index % 9) - 4) * 0.004 + 0.001);
  const closes = marketReturns.reduce(
    (rows, ret) => [...rows, rows.at(-1)! * (1 + ret * scale)],
    [100],
  );
  const timestamps = Array.from(
    { length: closes.length },
    (_, index) => 1_688_601_600 + index * 7 * 86_400,
  );
  return json({
    chart: {
      result: [{
        meta: { currency: "EUR", regularMarketPrice: closes.at(-1) },
        timestamp: timestamps,
        indicators: {
          quote: [{ close: closes, volume: closes.map(() => 1_000) }],
          adjclose: [{ adjclose: closes }],
        },
      }],
      error: null,
    },
  });
}

describe("Yahoo global beta benchmark routing", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["Athens", "KRI.AT", "^FTSE.AT"],
    ["Thailand", "SR.BK", "^SET.BK"],
    ["Belgium", "SIP.BR", "^BFX"],
    ["Portugal", "IPR.LS", "PSI20.LS"],
    ["Saudi Arabia", "9515.SR", "^TASI.SR"],
    ["Israel", "TEVA.TA", "^TA125.TA"],
    ["Poland", "PKO.WA", "WIG20.WA"],
  ])("routes %s listings to a local-market beta benchmark", async (_market, ticker, expectedBenchmark) => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(weeklyPayload(1.2))
      .mockResolvedValueOnce(weeklyPayload(1));

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker,
      canonicalTicker: ticker,
      name: `Fixture ${ticker}`,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(encodeURIComponent(expectedBenchmark));
    expect(result.data.beta).toBeCloseTo(1.2, 2);
    expect(result.data.betaBenchmark).toBe(expectedBenchmark);
    expect(result.data.betaObservationCount).toBeGreaterThanOrEqual(52);
  });
});
