import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialInvestmentCompanyGovernance,
  parseLatourOfficialBoardRoster,
} from "@/lib/data/official-investment-company-governance";

const BOARD: ReadonlyArray<readonly [string, "Yes" | "No", string]> = [
  ["Johan Nordström", "Yes", "Chairman of the Board"],
  ["Mariana Burenstam Linder", "Yes", "Board member"],
  ["Anders Böös", "Yes", "Board member"],
  ["Carl Douglas", "No", "Board member"],
  ["Eric Douglas", "No", "Board member"],
  ["Johan Hjertonsson", "No", "Board member and CEO"],
  ["Lena Olving", "Yes", "Board member"],
  ["Hélène Barnekow", "Yes", "Board member"],
];

function boardHtml(
  board: ReadonlyArray<readonly [string, "Yes" | "No", string]> = BOARD,
): string {
  return `
    <main>
      <h1>The Board of Directors</h1>
      <p>The Board of Latour consists of eight regular members, including the CEO.</p>
      <p>At the Annual General Meeting in 2026, Johan Nordström was elected Chairman of the Board.</p>
      <p>Two of the members are not independent of the company's largest owner, Eric Douglas and Carl Douglas.</p>
      ${board.map(([name, independent, role]) => `
        <section>
          <h2>${name}</h2>
          <p>${role}</p>
          <p>Independent: ${independent}</p>
        </section>
      `).join("")}
    </main>
  `;
}

const latour = {
  ticker: "LATO-B.ST",
  canonicalTicker: "LATO-B.ST",
  name: "Investment AB Latour B",
  exchange: "STO",
  currency: "SEK",
  securityType: "Common Stock" as const,
};

afterEach(() => vi.restoreAllMocks());

describe("StockBox 3 Latour official governance authority", () => {
  it("parses the exact current eight-person Latour board and validates the live independence markers", () => {
    expect(parseLatourOfficialBoardRoster(boardHtml())).toEqual(BOARD.map(([name]) => name));
  });

  it("uses complete two-axis 2026 independence evidence only while the current roster still matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(latour);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.directors).toHaveLength(8);
      expect(result.data.directors).toEqual(expect.arrayContaining([
        {
          name: "Johan Nordström",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: true,
        },
        {
          name: "Carl Douglas",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: false,
        },
        {
          name: "Johan Hjertonsson",
          independentFromCompanyManagement: false,
          independentFromMajorShareholders: true,
        },
        {
          name: "Hélène Barnekow",
          independentFromCompanyManagement: true,
          independentFromMajorShareholders: true,
        },
      ]));
      expect(result.data.sources).toHaveLength(2);
      expect(result.data.sources.some((source) => source.url.includes("Base%20Prospectus%2013%20February%202026"))).toBe(true);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://www.latour.se/en/corporate-governance/the-board-of-directors",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("fails closed when a current director is replaced by a person outside the versioned evidence", async () => {
    const changed = [
      ...BOARD.slice(0, -1),
      ["Different Director", "Yes", "Board member"] as const,
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(boardHtml(changed), { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyGovernance(latour);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("official_governance_roster_changed");
  });

  it("fails closed when the live combined independence marker contradicts the two-axis evidence", () => {
    const contradicted = BOARD.map((director) => (
      director[0] === "Carl Douglas"
        ? ([director[0], "Yes", director[2]] as const)
        : director
    ));
    expect(parseLatourOfficialBoardRoster(boardHtml(contradicted))).toBeNull();
  });

  it("fails closed on an incomplete Latour board", () => {
    expect(parseLatourOfficialBoardRoster(boardHtml(BOARD.slice(0, -1)))).toBeNull();
  });
});
