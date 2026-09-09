import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialInvestmentCompanyGovernance,
  parseLundbergsOfficialBoardRoster,
} from "@/lib/data/official-investment-company-governance";

const BOARD = [
  ["Bo Selling", true, true],
  ["Carl Bennet", true, true],
  ["Sofia Frändberg", true, true],
  ["Louise Lindh", false, false],
  ["Fredrik Lundberg", false, false],
  ["Katarina Martinson", true, false],
  ["Krister Mattsson", true, true],
  ["Sten Peterson", false, false],
  ["Lars Pettersson", true, true],
] as const;

function independenceSentence(companyIndependent: boolean, ownerIndependent: boolean): string {
  if (companyIndependent && ownerIndependent) {
    return "Independent in relation to the company and in relation to the company's major shareholders";
  }
  if (!companyIndependent && !ownerIndependent) {
    return "Not independent in relation to the company and in relation to the company's major shareholders";
  }
  return "Independent in relation to the company but not independent in relation to the company's major shareholders";
}

function boardHtml(
  board: ReadonlyArray<readonly [string, boolean, boolean]> = BOARD,
): string {
  return `<main><h1>Board of Directors</h1>${board.map(([name, companyIndependent, ownerIndependent]) => (
    `<section><h2>${name}</h2><p>${independenceSentence(companyIndependent, ownerIndependent)}</p></section>`
  )).join("")}</main>`;
}

const lundbergs = {
  ticker: "LUND-B.ST",
  canonicalTicker: "LUND-B.ST",
  name: "L E Lundbergföretagen AB B",
  exchange: "STO",
  currency: "SEK",
  securityType: "Common Stock" as const,
};

afterEach(() => vi.restoreAllMocks());

describe("StockBox 3 Lundbergs official governance authority", () => {
  it("parses the exact current nine-person board only when every two-axis independence status matches", () => {
    expect(parseLundbergsOfficialBoardRoster(boardHtml())).toEqual(BOARD.map(([name]) => name));
  });

  it("uses one current official Lundbergs page as complete roster and two-axis governance evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(lundbergs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.directors).toHaveLength(9);
      expect(result.data.directors).toEqual(expect.arrayContaining([
        {
          name: "Louise Lindh",
          independentFromCompanyManagement: false,
          independentFromMajorShareholders: false,
        },
        {
          name: "Katarina Martinson",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: false,
        },
        {
          name: "Bo Selling",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: true,
        },
      ]));
      expect(result.data.sources).toHaveLength(1);
      expect(result.data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://www.lundbergforetagen.se/en/governance/board-directors",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed when a current Lundbergs director is replaced", async () => {
    const changed = [
      ...BOARD.slice(0, -1),
      ["Different Director", true, true] as const,
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(changed), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(lundbergs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("official_governance_roster_changed");
  });

  it("fails closed when a live independence status contradicts the verified current board", () => {
    const contradicted = BOARD.map((director) => (
      director[0] === "Katarina Martinson"
        ? [director[0], true, true] as const
        : director
    ));
    expect(parseLundbergsOfficialBoardRoster(boardHtml(contradicted))).toBeNull();
  });

  it("fails closed on an incomplete Lundbergs board", () => {
    expect(parseLundbergsOfficialBoardRoster(boardHtml(BOARD.slice(0, -1)))).toBeNull();
  });
});
