import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStooqMarketData, mapStooqSymbol, parseStooqCsv } from "../../src/lib/data/stooq";

const company = { ticker: "AAPL", name: "Apple Inc.", country: "US", exchange: "Nasdaq" };
const csv = [
  "Date,Open,High,Low,Close,Volume",
  "2025-01-02,100,102,99,101,1000",
  "2025-01-03,101,104,100,103,1200",
].join("\n");

describe("Stooq market-data adapter", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses validated CSV and returns established USD metadata for a US listing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(csv, { status: 200 })));
    const result = await fetchStooqMarketData(company, { retries: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(103);
      expect(result.data.currency).toBe("USD");
      expect(result.data.volume).toBe(1200);
    }
  });

  it.each([
    ["N/D", "not_found"],
    ["Exceeded the daily limit", "rate_limited"],
    ["", "empty_response"],
    ["Date,Close\n2025-01-01,100", "malformed_response"],
  ])("returns an explicit failure for body %s", async (body, reason) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const result = await fetchStooqMarketData(company, { retries: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("reports 429 as rate limiting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("limited", { status: 429 })));
    const result = await fetchStooqMarketData(company, { retries: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("retries a transient 500 and then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response(csv, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchStooqMarketData(company, { retries: 1 });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("aborts bounded requests and returns timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })));
    const result = await fetchStooqMarketData(company, { retries: 0, timeoutMs: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("maps US share classes and explicit Stooq symbols", () => {
    expect(mapStooqSymbol({ ticker: "AAPL.US" })).toEqual({ symbol: "aapl.us", currency: "USD" });
    expect(mapStooqSymbol({ ticker: "BRK.B", country: "US" })).toEqual({ symbol: "brk-b.us", currency: "USD" });
  });

  it("does not append .us or invent a currency for an unidentified non-US ticker", () => {
    expect(mapStooqSymbol({ ticker: "VOLV-B", country: "SE", exchange: "Stockholm" })).toBeNull();
  });

  it("rejects malformed CSV columns before creating prices", () => {
    expect(parseStooqCsv("Date,Close\n2025-01-01,100")).toBeNull();
  });
});
