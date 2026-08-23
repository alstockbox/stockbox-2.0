import { afterEach, describe, expect, it, vi } from "vitest";
import { createTwelveDataMarketProvider, createTwelveDataSearchProvider } from "../../src/lib/data/twelve-data";

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Twelve Data adapters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns quote, history, statistics and explicit provider provenance", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ symbol: "AAPL", currency: "USD", datetime: "2026-08-21", close: "230", volume: "1000", fifty_two_week: { high: "240", low: "170" } }))
      .mockResolvedValueOnce(json({ values: Array.from({ length: 260 }, (_, index) => ({ datetime: `2025-${String(12 - Math.floor(index / 22)).padStart(2, "0")}-${String(index % 22 + 1).padStart(2, "0")}`, close: String(100 + index), volume: "900" })) }))
      .mockResolvedValueOnce(json({ stock_statistics: { shares_outstanding: "1000000" }, stock_price_summary: { beta: "1.2" } }));
    const provider = createTwelveDataMarketProvider("secret-key");
    const result = await provider.fetchMarketData({ ticker: "AAPL", name: "Apple", currency: "USD" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(expect.objectContaining({ price: 230, sharesOutstanding: 1_000_000, marketCap: 230_000_000, beta: 1.2, provider: "twelve-data" }));
    expect(provider.source?.({ ticker: "AAPL", name: "Apple" }).url).not.toContain("secret-key");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps global symbol results without claiming fundamentals coverage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: [{ symbol: "NOVO-B.CO", instrument_name: "Novo Nordisk A/S", exchange: "Copenhagen", country: "Denmark", currency: "DKK", instrument_type: "Common Stock" }] }));
    const result = await createTwelveDataSearchProvider("key").search("Novo Nordisk");
    expect(result.ok && result.data[0]).toEqual(expect.objectContaining({ ticker: "NOVO-B.CO", currency: "DKK", providerCapabilities: expect.objectContaining({ fundamentals: false, marketData: true }) }));
  });

  it("stays unavailable when no key is configured", async () => {
    await expect(createTwelveDataMarketProvider("").fetchMarketData({ ticker: "AAPL", name: "Apple" })).resolves.toEqual(expect.objectContaining({ ok: false, reason: "not_configured" }));
  });
});
