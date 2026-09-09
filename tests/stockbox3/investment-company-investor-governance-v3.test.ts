import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialInvestmentCompanyGovernance,
  parseInvestorOfficialBoardRoster,
} from "@/lib/data/official-investment-company-governance";

const BOARD = [
  ["Jacob Wallenberg", "jacob-wallenberg"],
  ["Marcus Wallenberg", "marcus-wallenberg"],
  ["Christian Cederholm", "christian-cederholm"],
  ["Katarina Berg", "katarina-berg"],
  ["Magdalena Gerger", "magdalena-gerger"],
  ["Sven Nyman", "sven-nyman"],
  ["Mats Rahmström", "mats-rahmstroem"],
  ["Grace Reksten Skaugen", "grace-reksten-skaugen"],
  ["Hans Stråberg", "hans-straaberg"],
  ["Fred Wallenberg", "fred-wallenberg"],
  ["Sara Öhrvall", "sara-oehrvall"],
] as const;

function boardHtml(board = BOARD): string {
  return `<main><h1>Board of Directors</h1>${board.map(([name, slug]) => (
    `<a href="/about-investor/board-management/board-of-directors/${slug}">${name}</a>`
  )).join("")}</main>`;
}

const investor = {
  ticker: "INVE-B.ST",
  canonicalTicker: "INVE-B.ST",
  name: "Investor AB B",
  exchange: "STO",
  currency: "SEK",
  securityType: "Common Stock" as const,
};

afterEach(() => vi.restoreAllMocks());

describe("StockBox 3 Investor official governance authority", () => {
  it("parses the complete current Investor board from the single official board page", () => {
    expect(parseInvestorOfficialBoardRoster(boardHtml())).toEqual(BOARD.map(([name]) => name));
  });

  it("uses complete versioned 2026 independence evidence only when all 11 current directors match", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(investor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.directors).toHaveLength(11);
      expect(result.data.directors).toEqual(expect.arrayContaining([
        {
          name: "Jacob Wallenberg",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: false,
        },
        {
          name: "Christian Cederholm",
          independentFromCompanyManagement: false,
          independentFromMajorShareholders: true,
        },
        {
          name: "Mats Rahmström",
          independentFromCompanyManagement: false,
          independentFromMajorShareholders: false,
        },
        {
          name: "Sara Öhrvall",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: true,
        },
      ]));
      expect(result.data.sources).toHaveLength(2);
      expect(result.data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://www.investorab.com/about-investor/board-management/board-of-directors",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed when Investor's live board roster no longer matches the versioned evidence", async () => {
    const changed = [
      ...BOARD.slice(0, -1),
      ["Different Director", "different-director"] as const,
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(changed), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(investor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("official_governance_roster_changed");
  });

  it("fails closed on an incomplete current Investor roster", () => {
    expect(parseInvestorOfficialBoardRoster(boardHtml(BOARD.slice(0, -1)))).toBeNull();
  });
});
