import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyGovernance,
  parseSvolderOfficialGovernanceEvidence,
} from "../../src/lib/data/official-investment-company-governance";

const BOARD_URL = "https://svolder.se/bolagsstyrning/styrelse/";

const CURRENT_BOARD_HTML = `
  <main>
    <h2>Styrelse</h2>
    <p>Styrelsen i Svolder består av sex ledamöter.</p>
    <h2>Fredrik Carlsson</h2><p>Styrelsens ordförande</p><p>Göteborg, född 1970. Invald 2013.</p>
    <h2>Johan Lundberg</h2><p>Styrelseledamot</p><p>Zug, född 1977. Invald 2020.</p>
    <h2>Anna-Maria Lundström Törnblom</h2><p>Styrelseledamot</p><p>Göteborg, född 1971. Invald 2017.</p>
    <h2>Clas-Göran Lyrhem</h2><p>Styrelseledamot</p><p>Göteborg, född 1961. Invald 2020.</p>
    <h2>Magnus Malm</h2><p>Styrelseledamot</p><p>Norrköping, född 1964. Invald 2021.</p>
    <h2>Pernilla Ramslöv</h2><p>Styrelseledamot</p><p>Stockholm, född 1970. Invald 2025.</p>
    <h2>Beroendeförhållanden</h2>
    <p>Beroendeförhållanden enligt Svensk kod för bolagsstyrning och Nasdaq Stockholms regelverk för emittenter:</p>
    <p>Styrelsens ledamöter är samtliga oberoende i förhållande till bolaget och bolagsledningen. Av dessa ledamöter är Anna-Maria Lundström Törnblom beroende i förhållande till Svolders största aktieägare.</p>
    <h2>Styrelsens bolagsbesök</h2>
  </main>
`;

const expectedDirectors = [
  { name: "Fredrik Carlsson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Johan Lundberg", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Anna-Maria Lundström Törnblom", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Clas-Göran Lyrhem", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Magnus Malm", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Pernilla Ramslöv", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
];

describe("official Svolder governance adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("derives the complete current board and explicit independence evidence from the official board page", () => {
    expect(parseSvolderOfficialGovernanceEvidence(CURRENT_BOARD_HTML)).toEqual(expectedDirectors);
  });

  it("returns auditable live governance evidence for Svolder without a static independence guess", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(CURRENT_BOARD_HTML, { status: 200 }));

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "SVOL-B.ST",
      canonicalTicker: "SVOL-B.ST",
      name: "Svolder AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(BOARD_URL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.directors).toEqual(expectedDirectors);
    expect(result.data.sources).toHaveLength(1);
    expect(result.data.sources[0]).toMatchObject({
      name: "Svolder current Board of Directors and independence relationships",
      url: BOARD_URL,
      provider: "official-investment-company-governance",
      version: "official-investment-company-governance-v1",
      capability: "specialized",
    });
    expect(result.data.diagnostic.status).toBe("available");
  });

  it("fails closed when the official page no longer contains explicit independence evidence", async () => {
    const htmlWithoutIndependence = CURRENT_BOARD_HTML.replace(
      "Styrelsens ledamöter är samtliga oberoende i förhållande till bolaget och bolagsledningen. Av dessa ledamöter är Anna-Maria Lundström Törnblom beroende i förhållande till Svolders största aktieägare.",
      "Information om beroendeförhållanden uppdateras.",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(htmlWithoutIndependence, { status: 200 }));

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "SVOL-B.ST",
      canonicalTicker: "SVOL-B.ST",
      name: "Svolder AB",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("svolder_governance_independence_evidence_unavailable");
    expect(result.diagnostic.status).toBe("unavailable");
    expect(result.diagnostic.reason).toBe("svolder_governance_independence_evidence_unavailable");
  });
});
