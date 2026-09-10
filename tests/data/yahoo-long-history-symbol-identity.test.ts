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

describe("Yahoo long-history symbol identity", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fails closed when Yahoo chart metadata identifies a different security", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      chart: {
        result: [{
          meta: { symbol: "MSFT", currency: "USD" },
          timestamp: [unix("2024-09-01"), unix("2026-09-01")],
          indicators: {
            quote: [{ close: [100, 160] }],
            adjclose: [{ adjclose: [95, 155] }],
          },
          events: {},
        }],
        error: null,
      },
    }));

    const result = await fetchYahooLongHistory({
      ticker: "BRK.B",
      canonicalTicker: "BRK.B",
      name: "Berkshire Hathaway Inc. Class B",
      country: "US",
      currency: "USD",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/symbol|identity|security/i);
  });
});
