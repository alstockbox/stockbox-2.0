import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveInvestmentCompanyGovernance } from "@/lib/data/investment-company-governance";
import {
  fetchOfficialInvestmentCompanyGovernance,
  parseIndustrivardenOfficialBoardRoster,
} from "@/lib/data/official-investment-company-governance";
import fs from "node:fs";
import path from "node:path";

const providerPath = path.join(process.cwd(), "src/lib/data/universal-security-provider.ts");

afterEach(() => vi.restoreAllMocks());

describe("Investment-company governance V3", () => {
  it("derives the 6% governance score only from complete director independence evidence", () => {
    const result = deriveInvestmentCompanyGovernance([
      { name: "Director A", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: "Director B", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
      { name: "Director C", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
    ]);
    expect(result.reason).toBeNull();
    expect(result.score).toBeCloseTo(66.6666667, 5);
  });

  it("fails closed on incomplete or duplicate board evidence", () => {
    expect(deriveInvestmentCompanyGovernance([
      { name: "Director A", independentFromCompanyManagement: true, independentFromMajorShareholders: null },
    ]).reason).toBe("incomplete_independence_evidence");
    expect(deriveInvestmentCompanyGovernance([
      { name: "Director A", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      { name: " director   a ", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
    ]).reason).toBe("duplicate_director_evidence");
  });

  it("revalidates Industrivärden's current official board roster before using versioned independence evidence", async () => {
    const names = [
      "Fredrik Lundberg", "Pär Boman", "Christian Caspar", "Marika Fredriksson", "Bengt Kjell",
      "Katarina Martinson", "Fredrik Persson", "Lars Pettersson", "Helena Stjernholm",
    ];
    const html = `<h1>Board of Directors</h1>${names.map((name) => `<div>${name} (1970)</div>`).join("")}<div>Last update</div>`;
    expect(parseIndustrivardenOfficialBoardRoster(html)).toEqual(names);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200 })));
    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "INDU-C.ST",
      canonicalTicker: "INDU-C.ST",
      name: "Industrivärden C",
      exchange: "STO",
      currency: "SEK",
      securityType: "Common Stock",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.directors).toHaveLength(9);
      expect(result.data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.data.sources).toHaveLength(2);
    }
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: "no-store" }));
  });

  it("fails closed when the live roster no longer matches the verified independence statement", async () => {
    const html = `<h1>Board of Directors</h1><div>Different Director (1970)</div><div>Last update</div>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200 })));
    const result = await fetchOfficialInvestmentCompanyGovernance({
      ticker: "INDU-C.ST",
      canonicalTicker: "INDU-C.ST",
      name: "Industrivärden C",
      exchange: "STO",
      currency: "SEK",
      securityType: "Common Stock",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("official_governance_roster_changed");
  });

  it("wires only fresh comparable official governance into the specialist and never invents a proxy", () => {
    const source = fs.readFileSync(providerPath, "utf8");
    expect(source).toContain("fetchOfficialInvestmentCompanyGovernance");
    expect(source).toContain("deriveInvestmentCompanyGovernance");
    expect(source).toContain("managementGovernanceScore: governance?.score ?? null");
    expect(source).toContain("isOfficialDisclosureComparable(officialGovernance.data.asOf, marketDate)");
    expect(source).not.toContain("managementGovernanceScore: latest");
  });
});
