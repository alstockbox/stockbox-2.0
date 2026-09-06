import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  fetchYahooExecutionQuoteV3,
  parseYahooExecutionQuoteV3,
} from "@/lib/paper-trading/execution-quote-v3";

const source = readFileSync("src/lib/paper-trading/execution-quote-v3.ts", "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function payload(meta: Record<string, unknown>) {
  return {
    chart: {
      result: [{ meta }],
      error: null,
    },
  };
}

describe("Paper execution quote V3", () => {
  it("verifies only a provider price with provider regularMarketTime and currency", () => {
    const result = parseYahooExecutionQuoteV3("AAPL", payload({
      regularMarketPrice: 231.42,
      regularMarketTime: 1788610200,
      currency: "USD",
    }));

    expect(result.reason).toBeNull();
    expect(result.observation).toEqual({
      ticker: "AAPL",
      price: 231.42,
      currency: "USD",
      observedAt: new Date(1788610200 * 1000).toISOString(),
      provider: "yahoo-chart-execution",
      verification: "VERIFIED",
    });
  });

  it("never substitutes request time when provider timestamp is missing", () => {
    const result = parseYahooExecutionQuoteV3("AAPL", payload({
      regularMarketPrice: 231.42,
      currency: "USD",
    }));

    expect(result.reason).toBe("missing_regular_market_time");
    expect(result.observation.observedAt).toBeNull();
    expect(result.observation.verification).toBe("UNVERIFIED");
    expect(source).not.toMatch(/observedAt:\s*new Date\(\)\.toISOString\(\)/);
  });

  it("fails closed for invalid price or currency", () => {
    expect(parseYahooExecutionQuoteV3("AAPL", payload({
      regularMarketPrice: -1,
      regularMarketTime: 1788610200,
      currency: "USD",
    })).observation.verification).toBe("UNVERIFIED");

    expect(parseYahooExecutionQuoteV3("AAPL", payload({
      regularMarketPrice: 231.42,
      regularMarketTime: 1788610200,
      currency: "US",
    })).observation.verification).toBe("UNVERIFIED");
  });

  it("preserves the StockBox ticker identity instead of trusting provider metadata", () => {
    const result = parseYahooExecutionQuoteV3("BRK.B", {
      chart: {
        result: [{
          meta: {
            symbol: "SPOOFED",
            regularMarketPrice: 500,
            regularMarketTime: 1788610200,
            currency: "USD",
          },
        }],
        error: null,
      },
    });
    expect(result.observation.ticker).toBe("BRK.B");
    expect(result.observation.verification).toBe("VERIFIED");
  });

  it("maps US share-class dots only at the Yahoo request boundary while preserving StockBox identity", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload({
      regularMarketPrice: 500,
      regularMarketTime: 1788610200,
      currency: "USD",
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYahooExecutionQuoteV3("BRK.B");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("/BRK-B?");
    expect(result.observation.ticker).toBe("BRK.B");
    expect(result.observation.verification).toBe("VERIFIED");
  });

  it("does not rewrite exchange-qualified symbols as share classes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload({
      regularMarketPrice: 250,
      regularMarketTime: 1788610200,
      currency: "SEK",
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYahooExecutionQuoteV3("VOLV-B.ST");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestedUrl).toContain("/VOLV-B.ST?");
    expect(result.observation.ticker).toBe("VOLV-B.ST");
  });

  it("marks provider errors unavailable rather than fabricating a quote", () => {
    const result = parseYahooExecutionQuoteV3("AAPL", {
      chart: { result: null, error: { code: "Not Found", description: "No data found" } },
    });
    expect(result.reason).toBe("No data found");
    expect(result.observation).toMatchObject({
      ticker: "AAPL",
      price: null,
      observedAt: null,
      verification: "UNAVAILABLE",
    });
  });

  it("uses a no-store one-minute execution request and does not reuse analysis caching", () => {
    expect(source).toContain('url.searchParams.set("interval", "1m")');
    expect(source).toContain('url.searchParams.set("range", "1d")');
    expect(source).toContain('cache: "no-store"');
    expect(source).not.toContain("revalidate: 60 * 15");
  });
});