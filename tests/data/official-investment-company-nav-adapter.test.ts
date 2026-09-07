import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnnualNavPerShareObservation, NavPerShareObservation } from "../../src/lib/data/investment-company-nav-history";
import { fetchOfficialInvestmentCompanyNav } from "../../src/lib/data/official-investment-company-nav";

type NavResultWithHistory = Awaited<ReturnType<typeof fetchOfficialInvestmentCompanyNav>> & {
  data?: {
    navPerShareHistory?: NavPerShareObservation[];
    annualNavPerShareHistory?: AnnualNavPerShareObservation[];
    historySource?: {
      url?: string;
      provider?: string;
      version?: string;
    } | null;
    source?: { version?: string };
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official investment-company NAV adapter history", () => {
  it("returns Latour NAV/share history from the same single official-page request", async () => {
    const html = `
      <table>
        <tr><th>Mått</th><th>Q2/23</th><th>Q2/24</th><th>Q2/25</th><th>Q2/26</th></tr>
        <tr><td>Substansvärde, Mkr</td><td>123,527</td><td>142,100</td><td>151,800</td><td>166,200</td></tr>
        <tr><td>Substansvärde per aktie, kr</td><td>193</td><td>222</td><td>237</td><td>260</td></tr>
      </table>
    `;
    const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const rawResult = await fetchOfficialInvestmentCompanyNav({
      ticker: "LATO-B.ST",
      name: "Investment AB Latour",
      securityType: "Common Stock",
    });
    const result = rawResult as NavResultWithHistory;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.reportedNav).toBe(166_200_000_000);
    expect(result.data.reportedNavPerShare).toBe(260);
    expect(result.data.navAsOf).toBe("2026-06-30");
    expect(result.data.navPerShareHistory).toEqual([
      { date: "2023-06-30", navPerShare: 193 },
      { date: "2024-06-30", navPerShare: 222 },
      { date: "2025-06-30", navPerShare: 237 },
      { date: "2026-06-30", navPerShare: 260 },
    ]);
    expect(result.data.source.version).toBe("official-investment-company-nav-v3");
  });

  it("returns an empty history for an issuer whose historical parser is not verified yet", async () => {
    const html = `<main><p>Adjusted net asset value (NAV) was SEK 964.1 bn (SEK 397 per share) on June 30, 2026.</p></main>`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const rawResult = await fetchOfficialInvestmentCompanyNav({
      ticker: "INVE-B.ST",
      name: "Investor AB",
      securityType: "Common Stock",
    });
    const result = rawResult as NavResultWithHistory;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.reportedNavPerShare).toBe(397);
    expect(result.data.navPerShareHistory).toEqual([]);
    expect(result.data.source.version).toBe("official-investment-company-nav-v3");
  });

  it("fetches Svolder current NAV and annual NAV/share history from their distinct official pages with separate provenance", async () => {
    const currentUrl = "https://svolder.se/pressreleaser/";
    const annualUrl = "https://svolder.se/investor-relations/svolderaktien/";
    const currentHtml = `<article><h2>Svolders substansvärde 2026-08-28: 60 SEK per aktie</h2></article>`;
    const annualHtml = `
      <table>
        <tr><th></th><th>24/25</th><th>23/24</th><th>22/23</th><th>21/22</th><th>20/21</th></tr>
        <tr><td>Substansvärde, SEK</td><td>57,20</td><td>58,80</td><td>51,20</td><td>57,30</td><td>69,50</td></tr>
      </table>
    `;
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === currentUrl) return new Response(currentHtml, { status: 200 });
      if (url === annualUrl) return new Response(annualHtml, { status: 200 });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rawResult = await fetchOfficialInvestmentCompanyNav({
      ticker: "SVOL-B.ST",
      name: "Svolder AB",
      securityType: "Common Stock",
    });
    const result = rawResult as NavResultWithHistory;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => typeof input === "string" ? input : String(input))).toEqual(
      expect.arrayContaining([currentUrl, annualUrl]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.reportedNavPerShare).toBe(60);
    expect(result.data.navAsOf).toBe("2026-08-28");
    expect(result.data.annualNavPerShareHistory).toEqual([
      { year: 2025, navPerShare: 57.2 },
      { year: 2024, navPerShare: 58.8 },
      { year: 2023, navPerShare: 51.2 },
      { year: 2022, navPerShare: 57.3 },
      { year: 2021, navPerShare: 69.5 },
    ]);
    expect(result.data.historySource).toEqual(expect.objectContaining({
      url: annualUrl,
      provider: "official-investment-company-nav",
      version: "official-investment-company-nav-annual-history-v1",
    }));
  });
});