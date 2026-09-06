import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS } from "@/lib/paper-trading/final-performance-v3";
import {
  fetchYahooFinalCutoffQuoteV3,
  parseYahooFinalCutoffQuoteV3,
} from "@/lib/paper-trading/final-cutoff-quote-v3";

const source = readFileSync("src/lib/paper-trading/final-cutoff-quote-v3.ts", "utf8");
const CUTOFF = "2026-09-06T20:00:00.000Z";
const cutoffMs = Date.parse(CUTOFF);
const second = (ms: number) => Math.floor(ms / 1000);

function payload(input: {
  timestamps: number[];
  closes: Array<number | null>;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketTime?: number;
}) {
  return {
    chart: {
      result: [{
        meta: {
          currency: input.currency ?? "USD",
          regularMarketPrice: input.regularMarketPrice,
          regularMarketTime: input.regularMarketTime,
        },
        timestamp: input.timestamps,
        indicators: { quote: [{ close: input.closes }] },
      }],
      error: null,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Paper Trading V3 final cutoff Yahoo quote", () => {
  it("chooses the latest genuine one-minute close at or before the authoritative cutoff", () => {
    const result = parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload({
      timestamps: [
        second(cutoffMs - 5 * 60_000),
        second(cutoffMs - 60_000),
        second(cutoffMs + 60_000),
      ],
      closes: [100, 101.25, 999],
      regularMarketPrice: 777,
      regularMarketTime: second(cutoffMs + 60_000),
    }));

    expect(result.reason).toBeNull();
    expect(result.observation).toEqual({
      ticker: "AAPL",
      price: 101.25,
      currency: "USD",
      observedAt: new Date(cutoffMs - 60_000).toISOString(),
      provider: "yahoo-chart-final-cutoff",
      verification: "VERIFIED",
    });
  });

  it("never uses post-cutoff bars, regularMarketPrice, interpolation or request time", () => {
    const result = parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload({
      timestamps: [
        second(cutoffMs - 3 * 60_000),
        second(cutoffMs + 1_000),
      ],
      closes: [98.5, 500],
      regularMarketPrice: 900,
      regularMarketTime: second(cutoffMs + 5 * 60_000),
    }));

    expect(result.observation).toMatchObject({
      price: 98.5,
      observedAt: new Date(cutoffMs - 3 * 60_000).toISOString(),
      verification: "VERIFIED",
    });
    expect(source).not.toContain("regularMarketPrice");
    expect(source).not.toMatch(/observedAt:\s*new Date\(\)\.toISOString\(\)/);
    expect(source.toLowerCase()).not.toContain("interpolat");
  });

  it("fails closed when the latest genuine pre-cutoff bar is outside the final lookback", () => {
    const result = parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload({
      timestamps: [second(cutoffMs - PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS - 1_000)],
      closes: [100],
    }));

    expect(result.reason).toBe("no_fresh_final_bar");
    expect(result.observation).toMatchObject({
      price: null,
      observedAt: null,
      verification: "UNAVAILABLE",
    });
  });

  it("fails closed for malformed series, invalid prices or invalid currency", () => {
    expect(parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload({
      timestamps: [second(cutoffMs - 60_000), second(cutoffMs)],
      closes: [100],
    })).reason).toBe("malformed_quote_series");

    expect(parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload({
      timestamps: [second(cutoffMs - 60_000)],
      closes: [-1],
    })).observation.verification).toBe("UNAVAILABLE");

    expect(parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload({
      timestamps: [second(cutoffMs - 60_000)],
      closes: [100],
      currency: "US",
    })).observation.verification).toBe("UNVERIFIED");
  });

  it("skips null bars but preserves the exact provider timestamp of the chosen bar", () => {
    const result = parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, payload({
      timestamps: [
        second(cutoffMs - 2 * 60_000),
        second(cutoffMs - 60_000),
      ],
      closes: [99.75, null],
    }));

    expect(result.observation).toMatchObject({
      price: 99.75,
      observedAt: new Date(cutoffMs - 2 * 60_000).toISOString(),
      verification: "VERIFIED",
    });
  });

  it("marks provider errors unavailable without fabricating a historical quote", () => {
    const result = parseYahooFinalCutoffQuoteV3("AAPL", CUTOFF, {
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

  it("requests only the bounded one-minute historical window around the server cutoff", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify(payload({
      timestamps: [second(cutoffMs - 60_000)],
      closes: [500],
    })), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYahooFinalCutoffQuoteV3("BRK.B", CUTOFF);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.pathname).toContain("/BRK-B");
    expect(requested.searchParams.get("interval")).toBe("1m");
    expect(requested.searchParams.get("period1")).toBe(String(second(cutoffMs - PAPER_FINAL_PERFORMANCE_V3_MAX_QUOTE_AGE_MS)));
    expect(requested.searchParams.get("period2")).toBe(String(second(cutoffMs) + 60));
    expect(requested.searchParams.has("range")).toBe(false);
    expect(result.observation.ticker).toBe("BRK.B");
    expect(result.observation.verification).toBe("VERIFIED");
    expect(source).toContain('cache: "no-store"');
  });

  it("rejects invalid cutoff input before making any provider request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYahooFinalCutoffQuoteV3("AAPL", "not-a-time");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.reason).toBe("invalid_cutoff");
    expect(result.observation.verification).toBe("UNAVAILABLE");
  });
});
