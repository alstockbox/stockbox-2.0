import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyGovernance,
  parseIndustrivardenOfficialBoardRoster,
} from "../../src/lib/data/official-investment-company-governance";

const CURRENT_BOARD_URL = "https://www.industrivarden.se/en-gb/corporate-governance/board-of-directors/board-of-directors/";
const INDEPENDENCE_STATEMENT_URL = "https://www.industrivarden.se/globalassets/arsstamma/2026/engelska/05b_nominating-committees-proposals-report-and-statement.pdf";

const currentIndustrivardenBoardHtml = `
  <main>
    <h1>Board of Directors</h1>
    <section><h2>Fredrik Lundberg (1951)</h2><p>Chairman of the Board</p></section>
    <section><h2>Pär Boman (1961)</h2><p>Vice Chairman of the Board</p></section>
    <section><h2>Christian Caspar (1973)</h2><p>Member of the Board</p></section>
    <section><h2>Marika Fredriksson (1963)</h2><p>Member of the Board</p></section>
    <section><h2>Bengt Kjell (1954)</h2><p>Member of the Board</p></section>
    <section><h2>Katarina Martinson (1981)</h2><p>Member of the Board</p></section>
    <section><h2>Fredrik Persson (1968)</h2><p>Member of the Board</p></section>
    <section><h2>Lars Pettersson (1954)</h2><p>Member of the Board</p></section>
    <section><h2>Helena Stjernholm (1970)</h2><p>Member of the Board</p></section>
    <p>Last update: Mar 2, 2026</p>
  </main>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official investment-company governance adapter", () => {
  it("parses the complete current official Industrivärden board roster instead of checking only known names", () => {
    expect(parseIndustrivardenOfficialBoardRoster(currentIndustrivardenBoardHtml)).toEqual([
      "Fredrik Lundberg",
      "Pär Boman",
      "Christian Caspar",
      "Marika Fredriksson",
      "Bengt Kjell",
      "Katarina Martinson",
      "Fredrik Persson",
      "Lars Pettersson",
      "Helena Stjernholm",
    ]);
  });

  it("returns verified 2026 independence evidence only when the live official board roster exactly matches the statement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(currentIndustrivardenBoardHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "INDU-C.ST",
      name: "AB Industrivärden",
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
      { name: "Fredrik Lundberg", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
      { name: "Pär Boman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Christian Caspar", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Marika Fredriksson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Bengt Kjell", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Katarina Martinson", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
      { name: "Fredrik Persson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Lars Pettersson", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
      { name: "Helena Stjernholm", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
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

  it("fails closed when the current official board roster differs from the board covered by verified independence evidence", async () => {
    const changedRosterHtml = currentIndustrivardenBoardHtml.replace(
      '<p>Last update: Mar 2, 2026</p>',
      '<section><h2>New Director (1975)</h2><p>Member of the Board</p></section><p>Last update: Sep 7, 2026</p>',
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response(changedRosterHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "INDU-C.ST",
      name: "Industrivärden AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.status).toBe("unavailable");
    expect(result.diagnostic.reason).toBe("industrivarden_current_board_roster_mismatch");
  });

  it("fails closed without making a request when no verified governance adapter is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "UNCONFIGURED-IC.ST",
      name: "Unconfigured Investment Company AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.reason).toBe("official_governance_adapter_not_configured");
  });
});