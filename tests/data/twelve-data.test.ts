import { afterEach, describe, expect, it, vi } from "vitest";
import { createTwelveDataMarketProvider, createTwelveDataSearchProvider } from "../../src/lib/data/twelve-data";

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function historyRows(count = 260) {
  const start = Date.parse("2025-01-02T00:00:00Z");
  return Array.from({ length: count }, (_, index) => ({
    datetime: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    close: String(100 + index),
    volume: "900",
  }));
}

function monthlyRows(startYear = 2000, count = 320) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(startYear, index, 28));
    return {
      datetime: date.toISOString().slice(0, 10),
      close: String(50 + index),
      volume: "900",
    };
  });
}

describe("Twelve Data adapters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns full-range adjusted history, corporate actions, statistics and explicit provider provenance", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ symbol: "AAPL", currency: "USD", datetime: "2026-08-21", close: "230", volume: "1000", fifty_two_week: { high: "240", low: "170" } }))
      .mockResolvedValueOnce(json({ values: historyRows(400) }))
      .mockResolvedValueOnce(json({ values: monthlyRows(2000, 320) }))
      .mockResolvedValueOnce(json({ statistics: { valuations_metrics: { market_capitalization: "230000000" }, stock_price_summary: { beta: "1.2" } }, stock_statistics: { shares_outstanding: "1000000" } }))
      .mockResolvedValueOnce(json({ meta: { currency: "USD" }, dividends: [{ ex_date: "2026-08-07", amount: 0.26 }, { ex_date: "2026-05-08", amount: 0.26 }] }))
      .mockResolvedValueOnce(json({ splits: [{ date: "2020-08-31", description: "4-for-1 split", ratio: 0.25, from_factor: 4, to_factor: 1 }] }));
    const provider = createTwelveDataMarketProvider("secret-key");
    const result = await provider.fetchMarketData({ ticker: "AAPL", name: "Apple", currency: "USD" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(expect.objectContaining({
        price: 230,
        sharesOutstanding: 1_000_000,
        marketCap: 230_000_000,
        beta: 1.2,
        betaMethod: "provider_statistics",
        provider: "twelve-data",
        priceHistoryBasis: "adjusted_close",
      }));
      expect(result.data.priceHistory?.length).toBeGreaterThan(250);
      expect(result.data.priceHistory?.at(0)?.date.startsWith("2000-")).toBe(true);
      expect(result.data.historyLength).toBe(result.data.priceHistory?.length);
      expect(result.data.dividendEvents).toEqual([
        { date: "2026-05-08", amount: 0.26, currency: "USD", provider: "twelve-data" },
        { date: "2026-08-07", amount: 0.26, currency: "USD", provider: "twelve-data" },
      ]);
      expect(result.data.splitEvents).toEqual([
        { date: "2020-08-31", numerator: 4, denominator: 1, splitRatio: 4, provider: "twelve-data" },
      ]);
    }
    expect(provider.source?.({ ticker: "AAPL", name: "Apple" }).url).not.toContain("secret-key");
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const dailyUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(dailyUrl.searchParams.get("interval")).toBe("1day");
    expect(dailyUrl.searchParams.get("outputsize")).toBe("400");
    expect(dailyUrl.searchParams.get("adjust")).toBe("all");
    const maxUrl = new URL(String(fetchMock.mock.calls[2]?.[0]));
    expect(maxUrl.searchParams.get("interval")).toBe("1month");
    expect(maxUrl.searchParams.get("outputsize")).toBe("5000");
    expect(maxUrl.searchParams.get("start_date")).toBe("1970-01-01");
    expect(maxUrl.searchParams.get("adjust")).toBe("all");
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain("/dividends");
    expect(String(fetchMock.mock.calls[4]?.[0])).toContain("start_date=1970-01-01");
    expect(String(fetchMock.mock.calls[5]?.[0])).toContain("/splits");
  });

  it("falls back to available daily history when full-range history is unavailable", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ symbol: "AAPL", currency: "USD", datetime: "2026-08-21", close: "230" }))
      .mockResolvedValueOnce(json({ values: historyRows(300) }))
      .mockResolvedValueOnce(json({ status: "error", code: 403, message: "Plan upgrade required" }))
      .mockResolvedValueOnce(json({ stock_statistics: { shares_outstanding: "1000000" } }))
      .mockResolvedValueOnce(json({ meta: { currency: "USD" }, dividends: [] }))
      .mockResolvedValueOnce(json({ splits: [] }));
    const result = await createTwelveDataMarketProvider("key").fetchMarketData({ ticker: "AAPL", name: "Apple", currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnostic.status).toBe("partial");
    expect(result.diagnostic.reason).toBe("max_price_history_unavailable");
    expect(result.data.priceHistory?.length).toBeGreaterThan(5);
  });

  it("keeps market data usable when premium corporate-action endpoints are unavailable", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ symbol: "AAPL", currency: "USD", datetime: "2026-08-21", close: "230" }))
      .mockResolvedValueOnce(json({ values: historyRows(300) }))
      .mockResolvedValueOnce(json({ values: monthlyRows(2010, 200) }))
      .mockResolvedValueOnce(json({ stock_statistics: { shares_outstanding: "1000000" } }))
      .mockResolvedValueOnce(json({ status: "error", code: 403, message: "Plan upgrade required" }))
      .mockResolvedValueOnce(json({ status: "error", code: 403, message: "Plan upgrade required" }));
    const result = await createTwelveDataMarketProvider("key").fetchMarketData({ ticker: "AAPL", name: "Apple", currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagnostic.status).toBe("partial");
    expect(result.diagnostic.reason).toBe("corporate_actions_unavailable");
    expect(result.data.dividendEvents).toEqual([]);
    expect(result.data.splitEvents).toEqual([]);
  });

  it("rejects malformed and future-dated corporate actions instead of fabricating history", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ symbol: "AAPL", currency: "USD", datetime: "2026-08-21", close: "230" }))
      .mockResolvedValueOnce(json({ values: historyRows(300) }))
      .mockResolvedValueOnce(json({ values: monthlyRows(2010, 200) }))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ meta: { currency: "USD" }, dividends: [{ ex_date: "2099-01-01", amount: 1 }, { ex_date: "2026-05-08", amount: -2 }] }))
      .mockResolvedValueOnce(json({ splits: [{ date: "2020-08-31", ratio: 0 }, { date: "2099-01-01", from_factor: 4, to_factor: 1 }] }));
    const result = await createTwelveDataMarketProvider("key").fetchMarketData({ ticker: "AAPL", name: "Apple", currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dividendEvents).toEqual([]);
    expect(result.data.splitEvents).toEqual([]);
  });

  it("maps global symbol results without claiming fundamentals coverage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: [{ symbol: "NOVO-B.CO", instrument_name: "Novo Nordisk A/S", exchange: "Copenhagen", country: "Denmark", currency: "DKK", instrument_type: "Common Stock" }] }));
    const result = await createTwelveDataSearchProvider("key").search("Novo Nordisk");
    expect(result.ok && result.data[0]).toEqual(expect.objectContaining({ ticker: "NOVO-B.CO", currency: "DKK", providerCapabilities: expect.objectContaining({ fundamentals: false, marketData: true }) }));
  });

  it("stays unavailable when no key is configured", async () => {
    await expect(createTwelveDataMarketProvider("").fetchMarketData({ ticker: "AAPL", name: "Apple" })).resolves.toEqual(expect.objectContaining({ ok: false, reason: "not_configured" }));
  });

  it("returns timeout when market-data requests exceed the provider deadline", async () => {
    vi.useFakeTimers();
    try {
      const observedSignals: AbortSignal[] = [];
      vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal) observedSignals.push(signal);
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      });

      const provider = createTwelveDataMarketProvider("secret-key");
      const pending = provider.fetchMarketData({ ticker: "AAPL", name: "Apple", currency: "USD" });
      await vi.runOnlyPendingTimersAsync();
      const result = await Promise.race([pending, Promise.resolve("still_pending" as const)]);

      expect(observedSignals).toHaveLength(6);
      expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
      expect(result).toEqual(expect.objectContaining({ ok: false, reason: "timeout" }));
    } finally {
      vi.useRealTimers();
    }
  });
});
