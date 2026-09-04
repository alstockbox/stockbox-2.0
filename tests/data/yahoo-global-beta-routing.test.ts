import { afterEach, describe, expect, it, vi } from "vitest";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market-core";

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function weeklyPayload(scale: number, truncateTailWeeks = 0) {
  const marketReturns = Array.from({ length: 80 }, (_, index) => ((index % 9) - 4) * 0.004 + 0.001);
  const allCloses = marketReturns.reduce(
    (rows, ret) => [...rows, rows.at(-1)! * (1 + ret * scale)],
    [100],
  );
  const allTimestamps = Array.from(
    { length: allCloses.length },
    (_, index) => 1_688_601_600 + index * 7 * 86_400,
  );
  const keep = Math.max(0, allCloses.length - truncateTailWeeks);
  const closes = allCloses.slice(0, keep);
  const timestamps = allTimestamps.slice(0, keep);
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
    ["Athens", "KRI.AT", "FTSE.AT"],
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

  it("keeps a well-sampled historical beta when benchmark lag stays within the nine-week policy", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(weeklyPayload(1.2))
      .mockResolvedValueOnce(weeklyPayload(1, 7));

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker: "FIXTURE.BK",
      canonicalTicker: "FIXTURE.BK",
      name: "Historical beta staleness fixture",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.beta).toBeCloseTo(1.2, 2);
    expect(result.data.betaBenchmark).toBe("^SET.BK");
    expect(result.data.betaObservationCount).toBeGreaterThanOrEqual(52);
  });

  it("still rejects a historical beta when the benchmark feed trails by more than nine weeks", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(weeklyPayload(1.2))
      .mockResolvedValueOnce(weeklyPayload(1, 10));

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker: "FIXTURE.BK",
      canonicalTicker: "FIXTURE.BK",
      name: "Stale beta benchmark fixture",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.beta).toBeNull();
    expect(result.data.betaBenchmark).toBeNull();
    expect(result.data.betaObservationCount).toBeNull();
  });
});
