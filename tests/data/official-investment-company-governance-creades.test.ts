import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyGovernance,
  parseCreadesOfficialBoardRoster,
} from "../../src/lib/data/official-investment-company-governance";

const CURRENT_BOARD_URL = "https://www.creades.se/bolagsstyrning/styrelse-ledande-befattningshavare-och-revisor/";
const INDEPENDENCE_STATEMENT_URL = "https://www.creades.se/media/0mfj3ehw/valberedningens-f%C3%B6rslag-%C3%A5rsst%C3%A4mma-2026.pdf";

const currentCreadesBoardHtml = `
  <main>
    <h1>Styrelse, ledande befattningshavare och revisor</h1>
    <p>På årsstämman i Creades den 15 april 2026 beslutades, i enlighet med valberedningens förslag, att styrelsen ska bestå av sju ledamöter.</p>
    <p>Till styrelseledamöter omvaldes Cecilia Hermansson, Peter Nilsson, Maria Rankka, Anna Settman, Lars Stugemo och Hans Toll. Sven Hagströmer omvaldes till styrelseordförande.</p>
    <h2>Ledande befattningshavare</h2>
    <p>Creades ledande befattningshavare utgörs av verkställande direktör John Hedberg och finansdirektör Åsa Robertson.</p>
  </main>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official Creades governance adapter", () => {
  it("parses the complete current official seven-director Creades roster without leaking executives", () => {
    expect(parseCreadesOfficialBoardRoster(currentCreadesBoardHtml)).toEqual([
      "Sven Hagströmer",
      "Cecilia Hermansson",
      "Peter Nilsson",
      "Maria Rankka",
      "Anna Settman",
      "Lars Stugemo",
      "Hans Toll",
    ]);
  });

  it("returns verified 2026 independence evidence only when the live official Creades roster exactly matches it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(currentCreadesBoardHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "CRED-A.ST",
      name: "Creades AB",
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
      { name: "Sven Hagströmer", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
      { name: "Cecilia Hermansson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Peter Nilsson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Maria Rankka", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Anna Settman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Lars Stugemo", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Hans Toll", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
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

  it("fails closed when Creades' current official roster differs from the board covered by the 2026 evidence", async () => {
    const changedRosterHtml = currentCreadesBoardHtml.replace(
      "Hans Toll.",
      "Hans Toll och Ny Ledamot.",
    ).replace("sju ledamöter", "åtta ledamöter");
    const fetchMock = vi.fn().mockResolvedValue(new Response(changedRosterHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "CRED-B.ST",
      name: "Creades AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.status).toBe("unavailable");
    expect(result.diagnostic.reason).toBe("creades_current_board_roster_mismatch");
  });
});