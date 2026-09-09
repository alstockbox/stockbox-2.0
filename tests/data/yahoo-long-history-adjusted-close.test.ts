import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchYahooLongHistory } from "../../src/lib/data/yahoo-long-history";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unix(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

type AdjustedData = {
  adjustedPriceHistory?: Array<{
    date: string;
    adjustedClose: number;
    currency?: string | null;
    provider?: string;
  }>;
};

describe("Yahoo long-history adjusted-close surface", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests adjusted close and preserves raw close as a separate history series", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      chart: {
        result: [{
          meta: { currency: "SEK" },
          timestamp: [unix("2023-09-01"), unix("2026-09-01")],
          indicators: {
            quote: [{ close: [100, 160] }],
            adjclose: [{ adjclose: [90, 180] }],
          },
          events: {},
        }],
        error: null,
      },
    }));

    const result = await fetchYahooLongHistory({
      ticker: "LATO-B.ST",
      canonicalTicker: "LATO-B.ST",
      name: "Investment AB Latour",
      country: "SE",
      currency: "SEK",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("includeAdjustedClose")).toBe("true");
    expect(result.data.priceHistory.map((point) => point.close)).toEqual([100, 160]);

    const data = result.data as typeof result.data & AdjustedData;
    expect(data.adjustedPriceHistory).toEqual([
      { date: "2023-09-01", adjustedClose: 90, currency: "SEK", provider: "yahoo-long-history" },
      { date: "2026-09-01", adjustedClose: 180, currency: "SEK", provider: "yahoo-long-history" },
    ]);
  });

  it("skips missing or invalid adjusted values without falling back to raw close", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      chart: {
        result: [{
          meta: { currency: "USD" },
          timestamp: [unix("2023-09-01"), unix("2024-09-01"), unix("2026-09-01")],
          indicators: {
            quote: [{ close: [100, 120, 160] }],
            adjclose: [{ adjclose: [null, -1, 180] }],
          },
          events: {},
        }],
        error: null,
      },
    }));

    const result = await fetchYahooLongHistory({
      ticker: "BRK-B",
      canonicalTicker: "BRK-B",
      name: "Berkshire Hathaway Inc.",
      country: "US",
      currency: "USD",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as typeof result.data & AdjustedData;
    expect(result.data.priceHistory).toHaveLength(3);
    expect(data.adjustedPriceHistory).toEqual([
      { date: "2026-09-01", adjustedClose: 180, currency: "USD", provider: "yahoo-long-history" },
    ]);
  });

  it("returns an explicit empty adjusted series when Yahoo exposes no adjclose payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      chart: {
        result: [{
          meta: { currency: "EUR" },
          timestamp: [unix("2026-09-01")],
          indicators: { quote: [{ close: [100] }] },
          events: {},
        }],
        error: null,
      },
    }));

    const result = await fetchYahooLongHistory({
      ticker: "PRX.AS",
      canonicalTicker: "PRX.AS",
      name: "Prosus N.V.",
      country: "NL",
      currency: "EUR",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as typeof result.data & AdjustedData;
    expect(data.adjustedPriceHistory).toEqual([]);
  });
});
