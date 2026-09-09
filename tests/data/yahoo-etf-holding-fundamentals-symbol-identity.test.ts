import { afterEach, expect, it, vi } from "vitest";
import { fetchYahooEtfHoldingFundamentals } from "../../src/lib/data/yahoo-etf-holding-fundamentals";

function yahooSummary(result: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ quoteSummary: { result: [result] } }),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("fails closed when Yahoo quoteSummary explicitly identifies a different holding symbol", async () => {
  const fetchMock = vi.fn(async () => yahooSummary({
    price: { symbol: "MSFT" },
    financialData: {
      revenueGrowth: { raw: 0.12 },
      operatingMargins: { raw: 0.27 },
    },
  }));
  vi.stubGlobal("fetch", fetchMock);

  const result = await fetchYahooEtfHoldingFundamentals({
    ticker: "AAPL-IDENTITY-UNIQUE",
    name: "Identity fixture",
    weight: 0.08,
  });

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.diagnostic.reason).toBe("symbol_mismatch");
});
