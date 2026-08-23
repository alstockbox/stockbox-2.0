import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getSecUserAgent: vi.fn()
}));

vi.mock("@/lib/env/server", () => ({
  getSecUserAgent: mocks.getSecUserAgent,
  getServerEnv: vi.fn(() => ({ NEXT_PUBLIC_POSTHOG_KEY: "" }))
}));

import { GET as searchCompaniesRoute } from "../../src/app/api/companies/search/route";
import { fetchSecTickerUniverse } from "../../src/lib/data/sec";

const tickerUniverse = {
  0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  1: { cik_str: 789019, ticker: "MSFT", title: "Microsoft Corp." }
};

describe("SEC provider requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSecUserAgent.mockReturnValue("StockBox/1.0 ops@stockbox.test");
    mocks.fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify(tickerUniverse), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
    );
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("uses the centrally resolved user agent and compliant SEC headers", async () => {
    const companies = await fetchSecTickerUniverse();

    expect(companies).toHaveLength(2);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://www.sec.gov/files/company_tickers.json",
      expect.objectContaining({
        headers: {
          "User-Agent": "StockBox/1.0 ops@stockbox.test",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate"
        },
        next: { revalidate: 60 * 60 * 24 },
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("keeps the company search API working with the resolved SEC contact", async () => {
    const response = await searchCompaniesRoute(
      new Request("http://localhost/api/companies/search?q=apple")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      companies: [expect.objectContaining({
        ticker: "AAPL",
        canonicalTicker: "AAPL",
        name: "Apple Inc.",
        cik: "0000320193",
        exchange: "NASDAQ",
        country: "US",
        entityId: "sec:0000320193",
        securityType: "Common Stock",
        providerCapabilities: expect.objectContaining({ fundamentals: true })
      })]
    });
  });
});
