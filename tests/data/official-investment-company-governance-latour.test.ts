import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyGovernance,
  parseLatourOfficialGovernanceEvidence,
} from "../../src/lib/data/official-investment-company-governance";

const BOARD_URL = "https://www.latour.se/en/corporate-governance/the-board-of-directors";

const CURRENT_BOARD_HTML = `
  <main>
    <p>The Board of Latour consists of eight regular members, including the CEO. All members are elected for one year.</p>
    <p>With the exception of the CEO, no member holds any assignments in the Group.</p>
    <p>Two of the members are not independent of the company's largest owner, Eric Douglas and Carl Douglas.</p>

    <h2>Johan Nordström</h2><p>Chairman of the Board</p><p>Born: 1966</p><p>Independent: Yes</p>
    <h2>Mariana Burenstam Linder</h2><p>Board member</p><p>Born: 1957</p><p>Independent: Yes</p>
    <h2>Anders Böös</h2><p>Board member</p><p>Born: 1964</p><p>Independent: Yes</p>
    <h2>Carl Douglas</h2><p>Board member</p><p>Born: 1965</p><p>Independent: No</p>
    <h2>Eric Douglas</h2><p>Board member</p><p>Born: 1968</p><p>Independent: No</p>
    <h2>Johan Hjertonsson</h2><p>Board member and CEO</p><p>Born: 1968</p><p>Independent: No</p>
    <h2>Lena Olving</h2><p>Board member</p><p>Born: 1956</p><p>Independent: Yes</p>
    <h2>Hélène Barnekow</h2><p>Board member</p><p>Born: 1964</p><p>Independent: Yes</p>
  </main>
`;

const expectedDirectors = [
  { name: "Johan Nordström", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Mariana Burenstam Linder", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Anders Böös", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Carl Douglas", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Eric Douglas", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Johan Hjertonsson", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
  { name: "Lena Olving", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Hélène Barnekow", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
];

describe("official Latour governance adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reconciles the complete current board with separate management and major-owner independence evidence", () => {
    expect(parseLatourOfficialGovernanceEvidence(CURRENT_BOARD_HTML)).toEqual(expectedDirectors);
  });

  it("returns auditable live governance evidence for Latour", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(CURRENT_BOARD_HTML, { status: 200 }));

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "LATO-B.ST",
      canonicalTicker: "LATO-B.ST",
      name: "Investment AB Latour",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(BOARD_URL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.directors).toEqual(expectedDirectors);
    expect(result.data.sources).toHaveLength(1);
    expect(result.data.sources[0]).toMatchObject({
      name: "Latour current Board of Directors and independence relationships",
      url: BOARD_URL,
      provider: "official-investment-company-governance",
      version: "official-investment-company-governance-v1",
      capability: "specialized",
    });
    expect(result.data.diagnostic.status).toBe("available");
  });

  it("fails closed when the official roster does not reconcile to the published board count", () => {
    const incompleteRoster = CURRENT_BOARD_HTML.replace(
      '<h2>Hélène Barnekow</h2><p>Board member</p><p>Born: 1964</p><p>Independent: Yes</p>',
      "",
    );

    expect(parseLatourOfficialGovernanceEvidence(incompleteRoster)).toBeNull();
  });

  it("fails closed when the published major-owner dependence names do not reconcile to the roster", async () => {
    const inconsistentOwnershipEvidence = CURRENT_BOARD_HTML.replace(
      "Eric Douglas and Carl Douglas",
      "Eric Douglas and Missing Director",
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(inconsistentOwnershipEvidence, { status: 200 }));

    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "LATO-B.ST",
      canonicalTicker: "LATO-B.ST",
      name: "Investment AB Latour",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("latour_governance_independence_evidence_unavailable");
    expect(result.diagnostic.status).toBe("unavailable");
    expect(result.diagnostic.reason).toBe("latour_governance_independence_evidence_unavailable");
  });
});
