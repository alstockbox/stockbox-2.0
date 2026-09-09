import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialInvestmentCompanyGovernance,
  parseSvolderOfficialBoardRoster,
} from "@/lib/data/official-investment-company-governance";

const BOARD = [
  "Fredrik Carlsson",
  "Johan Lundberg",
  "Anna-Maria Lundström Törnblom",
  "Clas-Göran Lyrhem",
  "Magnus Malm",
  "Pernilla Ramslöv",
] as const;

function boardHtml(board: readonly string[] = BOARD, independence = true): string {
  return `<main><h1>Styrelse</h1>${board.map((name) => `<h2>${name}</h2>`).join("")}
    <h2>Beroendeförhållanden</h2>
    ${independence
      ? "Styrelsens ledamöter är samtliga oberoende i förhållande till bolaget och bolagsledningen. Av dessa ledamöter är Anna-Maria Lundström Törnblom beroende i förhållande till Svolders största aktieägare."
      : "Fem av sex ledamöter är oberoende i förhållande till bolaget och bolagsledningen."}
  </main>`;
}

const svolder = {
  ticker: "SVOL-B.ST",
  canonicalTicker: "SVOL-B.ST",
  name: "Svolder AB B",
  exchange: "STO",
  currency: "SEK",
  securityType: "Common Stock" as const,
};

afterEach(() => vi.restoreAllMocks());

describe("StockBox 3 Svolder official governance authority", () => {
  it("parses the exact current six-person board only when both independence statements are present", () => {
    expect(parseSvolderOfficialBoardRoster(boardHtml())).toEqual([...BOARD]);
  });

  it("uses the single live official Svolder board page as complete two-axis governance evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(svolder);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.directors).toHaveLength(6);
      expect(result.data.directors).toEqual(expect.arrayContaining([
        {
          name: "Anna-Maria Lundström Törnblom",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: false,
        },
        {
          name: "Pernilla Ramslöv",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: true,
        },
      ]));
      expect(result.data.directors.every((director) => director.independentFromCompanyManagement === true)).toBe(true);
      expect(result.data.sources).toHaveLength(1);
      expect(result.data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://svolder.se/bolagsstyrning/styrelse/",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed when a current director is replaced", async () => {
    const changed = [...BOARD.slice(0, -1), "Different Director"];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(changed), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(svolder);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("official_governance_roster_changed");
  });

  it("fails closed on an incomplete board", () => {
    expect(parseSvolderOfficialBoardRoster(boardHtml(BOARD.slice(0, -1)))).toBeNull();
  });

  it("fails closed when the live independence statement no longer proves both axes", () => {
    expect(parseSvolderOfficialBoardRoster(boardHtml(BOARD, false))).toBeNull();
  });
});
