import { afterEach, describe, expect, it, vi } from "vitest";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unix(date: string) {
  return Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000);
}

function chartPayload(options: {
  date: string;
  price: number;
  dividends?: Array<{ date: string; amount: number }>;
  splits?: Array<{ date: string; numerator: number; denominator: number }>;
}) {
  const dividends = Object.fromEntries((options.dividends ?? []).map((event, index) => [String(index), {
    date: unix(event.date),
    amount: event.amount,
  }]));
  const splits = Object.fromEntries((options.splits ?? []).map((event, index) => [String(index), {
    date: unix(event.date),
    numerator: event.numerator,
    denominator: event.denominator,
    splitRatio: `${event.numerator}:${event.denominator}`,
  }]));

  return {
    chart: {
      result: [{
        meta: {
          currency: "USD",
          regularMarketTime: unix(options.date),
          regularMarketPrice: options.price,
          regularMarketVolume: 1_000_000,
        },
        timestamp: [unix(options.date)],
        indicators: {
          quote: [{ close: [options.price], volume: [1_000_000] }],
          adjclose: [{ adjclose: [options.price] }],
        },
        events: { dividends, splits },
      }],
      error: null,
    },
  };
}

describe("Yahoo corporate-action history coverage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fetches maximum corporate-action history without replacing bounded daily price history", async () => {
    const recent = chartPayload({
      date: "2026-09-03",
      price: 70,
      dividends: [{ date: "2026-06-13", amount: 0.51 }],
    });
    const fullHistory = chartPayload({
      date: "2026-09-03",
      price: 70,
      dividends: [
        { date: "1990-03-15", amount: 0.04 },
        { date: "2026-06-13", amount: 0.51 },
      ],
      splits: [{ date: "1996-05-13", numerator: 2, denominator: 1 }],
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      return Promise.resolve(json(url.searchParams.get("range") === "max" ? fullHistory : recent));
    });

    const result = await yahooMarketDataProvider.fetchMarketData({
      ticker: "DIV",
      canonicalTicker: "DIV",
      name: "Long-history dividend company",
      currency: "USD",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const requestedUrls = fetchMock.mock.calls.map(([input]) => new URL(String(input)));
    expect(requestedUrls).toEqual(expect.arrayContaining([
      expect.objectContaining({}),
    ]));
    expect(requestedUrls.some((url) => url.searchParams.get("range") === "10y" && url.searchParams.get("interval") === "1d")).toBe(true);
    expect(requestedUrls.some((url) => url.searchParams.get("range") === "max" && url.searchParams.get("interval") === "1mo")).toBe(true);

    expect(result.data.dividendEvents).toEqual([
      expect.objectContaining({ date: "1990-03-15", amount: 0.04, provider: "yahoo-chart" }),
      expect.objectContaining({ date: "2026-06-13", amount: 0.51, provider: "yahoo-chart" }),
    ]);
    expect(result.data.splitEvents).toEqual([
      expect.objectContaining({ date: "1996-05-13", splitRatio: 2, provider: "yahoo-chart" }),
    ]);
  });
});
