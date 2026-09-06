import { afterEach, describe, expect, it, vi } from "vitest";
import type { EtfHolding } from "../../src/lib/analysis/universal-security";
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

describe("Yahoo ETF holding fundamentals", () => {
  it("maps only explicit semantically safe holding fundamentals", async () => {
    const fetchMock = vi.fn(async () => yahooSummary({
      financialData: {
        revenueGrowth: { raw: 0.12 },
        earningsGrowth: { raw: 0.18 },
        operatingMargins: { raw: 0.27 },
        returnOnEquity: { raw: 0.31 },
        debtToEquity: { raw: 85 },
        freeCashflow: { raw: 12_000_000_000 },
      },
      defaultKeyStatistics: {
        forwardPE: { raw: 24.5 },
        priceToBook: { raw: 8.2 },
      },
      summaryDetail: {
        dividendYield: { raw: 0.006 },
        marketCap: { raw: 3_000_000_000_000 },
      },
      assetProfile: {
        sector: "Technology",
        country: "United States",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const holding: EtfHolding = { ticker: "AAPL", name: "Apple", weight: 0.08 };
    const result = await fetchYahooEtfHoldingFundamentals(holding);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      revenueGrowth: 0.12,
      epsGrowth: 0.18,
      operatingMargin: 0.27,
      forwardPe: 24.5,
      priceBook: 8.2,
      dividendYield: 0.006,
      sector: "Technology",
      country: "United States",
    });
    expect(result.data.roic).toBeUndefined();
    expect(result.data.netDebtToEbitda).toBeUndefined();
    expect(result.data.freeCashFlowYield).toBeUndefined();
    expect(result.data.stockBoxScore).toBeUndefined();
    expect(result.diagnostic.status).toBe("available");
    expect(result.source.capability).toBe("specialized");
  });

  it("falls back from query1 to query2 without changing field semantics", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
      .mockResolvedValueOnce(yahooSummary({
        financialData: {
          revenueGrowth: { raw: 0.07 },
          operatingMargins: { raw: 0.19 },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYahooEtfHoldingFundamentals({ ticker: "MSFT", name: "Microsoft", weight: 0.06 });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("query1.finance.yahoo.com");
    expect(String(fetchMock.mock.calls[1][0])).toContain("query2.finance.yahoo.com");
  });

  it("reuses a successful warm-instance snapshot for the same ticker", async () => {
    const fetchMock = vi.fn(async () => yahooSummary({
      financialData: {
        revenueGrowth: { raw: 0.1 },
        operatingMargins: { raw: 0.21 },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const holding: EtfHolding = { ticker: "CACHE-UNIQUE", name: "Cached", weight: 0.05 };
    const first = await fetchYahooEtfHoldingFundamentals(holding);
    const second = await fetchYahooEtfHoldingFundamentals(holding);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (!first.ok || !second.ok) return;
    expect(second.data).toEqual(first.data);
    expect(second.source.url).toBe(first.source.url);
  });

  it("does not cache upstream failures", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) } as Response));
    vi.stubGlobal("fetch", fetchMock);

    const holding: EtfHolding = { ticker: "FAIL-UNIQUE", name: "Failure", weight: 0.05 };
    const first = await fetchYahooEtfHoldingFundamentals(holding);
    const second = await fetchYahooEtfHoldingFundamentals(holding);

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fails closed when Yahoo returns no useful verified holding fields", async () => {
    const fetchMock = vi.fn(async () => yahooSummary({
      financialData: {
        returnOnEquity: { raw: 0.22 },
        debtToEquity: { raw: 70 },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYahooEtfHoldingFundamentals({ ticker: "EMPTY", name: "Empty", weight: 0.04 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.status).toBe("unavailable");
    expect(result.diagnostic.reason).toBe("no_verified_holding_fields");
  });

  it("fails closed before any request when the holding has no ticker", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYahooEtfHoldingFundamentals({ name: "Unmapped basket", weight: 0.12 });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
