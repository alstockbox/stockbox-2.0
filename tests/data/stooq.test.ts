import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStooqMarketData, mapStooqSymbol, parseStooqCsv } from "../../src/lib/data/stooq";

const company = { ticker: "AAPL", name: "Apple Inc.", country: "US", exchange: "Nasdaq" };
const csv = [
  "Date,Open,High,Low,Close,Volume",
  "2025-01-02,100,102,99,101,1000",
  "2025-01-03,101,104,100,103,1200",
].join("\n");

async function failureReason(body: string, init: ResponseInit = {}): Promise<string | null> {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200, ...init })));
  const result = await fetchStooqMarketData(company, { retries: 0 });
  return result.ok ? null : result.reason;
}

describe("Stooq market-data adapter", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("parses valid CSV and returns established USD metadata for a US listing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(csv, { status: 200 })));
    const result = await fetchStooqMarketData(company, { retries: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(103);
      expect(result.data.date).toBe("2025-01-03");
      expect(result.data.currency).toBe("USD");
      expect(result.data.volume).toBe(1200);
      expect(result.data.performance["1M"]).toBeUndefined();
    }
  });

  it("normalizes BOM, CRLF, case-insensitive reordered headers, extra columns and duplicate dates", () => {
    const body = [
      "\uFEFFvolume,CLOSE,Symbol,DATE,Open",
      "1200,103,AAPL,2025-01-03,101",
      "1000,101,AAPL,2025-01-02,100",
      "1250,104,AAPL,2025-01-03,102",
    ].join("\r\n");

    expect(parseStooqCsv(body, new Date("2026-08-23T00:00:00.000Z"))).toEqual([
      { date: "2025-01-02", close: 101, volume: 1000 },
      { date: "2025-01-03", close: 104, volume: 1250 },
    ]);
  });

  it("accepts optional volume and treats N/D volume as unavailable", () => {
    expect(parseStooqCsv(
      "Date,Close,Volume\n2025-01-02,101,N/D",
      new Date("2026-08-23T00:00:00.000Z"),
    )).toEqual([{ date: "2025-01-02", close: 101, volume: null }]);
    expect(parseStooqCsv(
      "Date,Close\n2025-01-02,101",
      new Date("2026-08-23T00:00:00.000Z"),
    )).toEqual([{ date: "2025-01-02", close: 101, volume: null }]);
  });

  it.each([
    ["N/D", {}, "not_found"],
    ["Exceeded the daily limit", {}, "rate_limited"],
    ["", {}, "empty_response"],
    ["Date,Open\n2025-01-01,100", {}, "unexpected_columns"],
    ["<!DOCTYPE html><html><body>Verify browser</body></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } }, "html_response"],
    [csv, { headers: { "Content-Type": "application/json" } }, "unexpected_content_type"],
    ["Date,Close\n2027-01-01,100", {}, "future_date"],
    ["Date,Close\n2025-01-01,-1", {}, "impossible_price"],
  ])("classifies rejected provider response as %s", async (body, init, reason) => {
    await expect(failureReason(body, init)).resolves.toBe(reason);
  });

  it("logs only safe response diagnostics for rejected HTML", async () => {
    const body = "<!DOCTYPE html><html><body>Provider challenge</body></html>";
    await failureReason(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });

    expect(console.error).toHaveBeenCalledWith(
      "Market data provider response rejected",
      expect.objectContaining({
        httpStatus: 200,
        contentType: "text/html; charset=utf-8",
        contentLength: body.length,
        resolvedProvider: "stooq-eod",
        symbol: "aapl.us",
        responseFormat: "html",
        headerColumns: [],
        parseFailure: "html_response",
      }),
    );
    const diagnostic = vi.mocked(console.error).mock.calls[0]?.[1] as Record<string, unknown>;
    expect(diagnostic).not.toHaveProperty("body");
    expect(diagnostic).not.toHaveProperty("headers");
  });

  it("reports 429 as rate limiting", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("limited", { status: 429 })));
    const result = await fetchStooqMarketData(company, { retries: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("reports a terminal 500 as an upstream error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));
    const result = await fetchStooqMarketData(company, { retries: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("upstream_error");
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
});
