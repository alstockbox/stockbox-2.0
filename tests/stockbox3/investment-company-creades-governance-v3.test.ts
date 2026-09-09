import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialInvestmentCompanyGovernance,
  parseCreadesOfficialBoardRoster,
} from "@/lib/data/official-investment-company-governance";

const BOARD = [
  "Sven Hagströmer",
  "Cecilia Hermansson",
  "Peter Nilsson",
  "Maria Rankka",
  "Anna Settman",
  "Lars Stugemo",
  "Hans Toll",
] as const;

function boardHtml(board: readonly string[] = BOARD): string {
  return `<main>
    <h1>Styrelse, ledande befattningshavare och revisor</h1>
    <p>På årsstämman i Creades den 15 april 2026 beslutades, i enlighet med valberedningens förslag, att styrelsen ska bestå av sju ledamöter.</p>
    <p>Styrelsens sammanställning från och med den 15 april 2026 är enligt nedan.</p>
    <h2>STYRELSE</h2>
    ${board.map((name) => `<h3>${name}</h3><p>Styrelseledamot.</p>`).join("")}
    <h2>LEDANDE BEFATTNINGSHAVARE</h2>
    <h3>John Hedberg, VD</h3>
  </main>`;
}

const creades = {
  ticker: "CRED-A.ST",
  canonicalTicker: "CRED-A.ST",
  name: "Creades AB A",
  exchange: "STO",
  currency: "SEK",
  securityType: "Common Stock" as const,
};

afterEach(() => vi.restoreAllMocks());

describe("StockBox 3 Creades official governance authority", () => {
  it("parses only the exact current seven-person Creades board effective 15 April 2026", () => {
    expect(parseCreadesOfficialBoardRoster(boardHtml())).toEqual([...BOARD]);
  });

  it("uses versioned 2026 two-axis independence evidence only while the current board still matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(creades);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.directors).toHaveLength(7);
      expect(result.data.directors).toEqual(expect.arrayContaining([
        {
          name: "Sven Hagströmer",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: false,
        },
        {
          name: "Cecilia Hermansson",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: true,
        },
      ]));
      expect(result.data.directors.every((director) => director.independentFromCompanyManagement === true)).toBe(true);
      expect(result.data.sources).toHaveLength(2);
      expect(result.data.sources[1]?.url).toContain("valberedningens-f%C3%B6rslag-%C3%A5rsst%C3%A4mma-2026.pdf");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://www.creades.se/bolagsstyrning/styrelse-ledande-befattningshavare-och-revisor/",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed when the live Creades board no longer matches the versioned independence evidence", async () => {
    const changed = [...BOARD.slice(0, -1), "Different Director"];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(changed), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(creades);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("official_governance_roster_changed");
  });

  it("fails closed on an incomplete current Creades board", () => {
    expect(parseCreadesOfficialBoardRoster(boardHtml(BOARD.slice(0, -1)))).toBeNull();
  });
});
