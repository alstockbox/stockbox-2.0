import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyNav,
  parseCreadesOfficialAnnualNavObservation,
} from "../../src/lib/data/official-investment-company-nav";

const CURRENT_URL = "https://www.creades.se/innehav/substansvarde/";
const HISTORY_URL = "https://www.creades.se/pressmeddelanden/pressmeddelanden/2025/creades-substansvarde-1-januari-30-november-2025/";

const currentHtml = `
  <main>
    <h1>Substansvärde per 2026-08-31</h1>
    <p>Creades substansvärde per 31 augusti uppgår till 96 kronor per aktie.</p>
    <p>Den 31 december 2025 uppgick substansvärdet till 83 kronor per aktie.</p>
    <table><tr><td>Totalt</td><td>13 027</td><td>96</td><td>100</td></tr></table>
  </main>
`;

const historyHtml = `
  <article>
    <h1>Creades substansvärde 1 januari – 30 november 2025</h1>
    <p>Creades substansvärde per 30 november uppgår till 83 kronor per aktie.</p>
    <p>Den 31 december 2024 uppgick substansvärdet till 75 kronor per aktie.</p>
  </article>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official Creades annual NAV history", () => {
  it("parses only an explicit 31 December year-end NAV/share observation", () => {
    expect(parseCreadesOfficialAnnualNavObservation(currentHtml)).toEqual({
      year: 2025,
      navPerShare: 83,
    });
    expect(parseCreadesOfficialAnnualNavObservation(historyHtml)).toEqual({
      year: 2024,
      navPerShare: 75,
    });
  });

  it("fails closed when the official page does not contain an explicit year-end NAV/share statement", () => {
    expect(parseCreadesOfficialAnnualNavObservation(
      "<p>Creades substansvärde per 30 november uppgår till 83 kronor per aktie.</p>",
    )).toBeNull();
  });

  it("returns current Creades NAV plus contiguous official annual anchors with separate history provenance", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === CURRENT_URL) return new Response(currentHtml, { status: 200 });
      if (url === HISTORY_URL) return new Response(historyHtml, { status: 200 });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyNav({
      ticker: "CRED-A.ST",
      name: "Creades AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([input]) => typeof input === "string" ? input : String(input))).toEqual(
      expect.arrayContaining([CURRENT_URL, HISTORY_URL]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.reportedNavPerShare).toBe(96);
    expect(result.data.navAsOf).toBe("2026-08-31");
    expect(result.data.annualNavPerShareHistory).toEqual([
      { year: 2025, navPerShare: 83 },
      { year: 2024, navPerShare: 75 },
    ]);
    expect(result.data.source).toEqual(expect.objectContaining({
      url: CURRENT_URL,
      provider: "official-investment-company-nav",
    }));
    expect(result.data.historySource).toEqual(expect.objectContaining({
      url: HISTORY_URL,
      provider: "official-investment-company-nav",
      version: "official-investment-company-nav-annual-history-v1",
    }));
  });

  it("fails annual history closed when the two official pages do not form consecutive year-end anchors", async () => {
    const nonContiguousHistoryHtml = historyHtml.replace("31 december 2024", "31 december 2023");
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url === CURRENT_URL) return new Response(currentHtml, { status: 200 });
      if (url === HISTORY_URL) return new Response(nonContiguousHistoryHtml, { status: 200 });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyNav({
      ticker: "CRED-A.ST",
      name: "Creades AB",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.annualNavPerShareHistory).toEqual([]);
    expect(result.data.historySource).toBeNull();
  });
});
