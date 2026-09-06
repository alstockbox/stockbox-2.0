import { afterEach, describe, expect, it, vi } from "vitest";
import type { NavPerShareObservation } from "../../src/lib/data/investment-company-nav-history";
import { fetchOfficialInvestmentCompanyNav } from "../../src/lib/data/official-investment-company-nav";

type NavResultWithHistory = Awaited<ReturnType<typeof fetchOfficialInvestmentCompanyNav>> & {
  data?: {
    navPerShareHistory?: NavPerShareObservation[];
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
});
