import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyGovernance,
  parseInvestorOfficialBoardRoster,
} from "../../src/lib/data/official-investment-company-governance";

const CURRENT_BOARD_URL = "https://www.investorab.com/about-investor/board-management/board-of-directors";
const INDEPENDENCE_STATEMENT_URL = "https://www.investorab.com/media/e3hbxzb5/information-about-proposed-board-of-directors-2026.pdf";

const currentInvestorBoardHtml = `
  <main>
    <h1>Board of Directors</h1>
    <section><a href="/about-investor/board-management/board-of-directors/jacob-wallenberg"><h2>Jacob Wallenberg</h2><p>Chair</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/marcus-wallenberg"><h2>Marcus Wallenberg</h2><p>Vice chair</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/christian-cederholm"><h2>Christian Cederholm</h2><p>Chief Executive Officer</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/katarina-berg"><h2>Katarina Berg</h2><p>Director</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/magdalena-gerger"><h2>Magdalena Gerger</h2><p>Director</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/sven-nyman"><h2>Sven Nyman</h2><p>Director</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/mats-rahmstroem"><h2>Mats Rahmström</h2><p>Director</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/grace-reksten-skaugen"><h2>Grace Reksten Skaugen</h2><p>Director</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/hans-straaberg"><h2>Hans Stråberg</h2><p>Director</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/fred-wallenberg"><h2>Fred Wallenberg</h2><p>Director</p></a></section>
    <section><a href="/about-investor/board-management/board-of-directors/sara-oehrvall"><h2>Sara Öhrvall</h2><p>Director</p></a></section>
  </main>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official Investor governance adapter", () => {
  it("parses the complete current official Investor board roster instead of filtering to known directors", () => {
    expect(parseInvestorOfficialBoardRoster(currentInvestorBoardHtml)).toEqual([
      "Jacob Wallenberg",
      "Marcus Wallenberg",
      "Christian Cederholm",
      "Katarina Berg",
      "Magdalena Gerger",
      "Sven Nyman",
      "Mats Rahmström",
      "Grace Reksten Skaugen",
      "Hans Stråberg",
      "Fred Wallenberg",
      "Sara Öhrvall",
    ]);
  });

  it("returns verified 2026 independence evidence only when the live official Investor roster exactly matches it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(currentInvestorBoardHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "INVE-B.ST",
      name: "Investor AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      CURRENT_BOARD_URL,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.directors).toEqual([
      { name: "Jacob Wallenberg", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
      { name: "Marcus Wallenberg", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
      { name: "Christian Cederholm", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
      { name: "Katarina Berg", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Magdalena Gerger", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Sven Nyman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Mats Rahmström", independentFromCompanyManagement: false, independentFromMajorShareholders: false },
      { name: "Grace Reksten Skaugen", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Hans Stråberg", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Fred Wallenberg", independentFromCompanyManagement: false, independentFromMajorShareholders: false },
      { name: "Sara Öhrvall", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
    ]);
    expect(result.data.sources).toHaveLength(2);
    expect(result.data.sources.map((source) => source.url)).toEqual([
      INDEPENDENCE_STATEMENT_URL,
      CURRENT_BOARD_URL,
    ]);
    expect(result.data.sources.every((source) => source.provider === "official-investment-company-governance")).toBe(true);
    expect(result.data.sources.every((source) => source.version === "official-investment-company-governance-v1")).toBe(true);
    expect(result.data.diagnostic.status).toBe("available");
  });

  it("fails closed when Investor's current official roster differs from the board covered by the 2026 evidence", async () => {
    const changedRosterHtml = currentInvestorBoardHtml.replace(
      "</main>",
      '<section><a href="/about-investor/board-management/board-of-directors/new-director"><h2>New Director</h2><p>Director</p></a></section></main>',
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response(changedRosterHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "INVE-A.ST",
      name: "Investor AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.status).toBe("unavailable");
    expect(result.diagnostic.reason).toBe("investor_current_board_roster_mismatch");
  });
});
