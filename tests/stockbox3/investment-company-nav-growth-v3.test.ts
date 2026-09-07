import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveInvestmentCompanyAnnualNavGrowth,
  deriveInvestmentCompanyNavGrowth,
} from "../../src/lib/data/investment-company-nav-history";

const officialNav = readFileSync("src/lib/data/official-investment-company-nav.ts", "utf8");
const provider = readFileSync("src/lib/data/universal-security-provider.ts", "utf8");

describe("StockBox 3 investment-company official NAV/share growth", () => {
  it("derives 3y/5y CAGR only from explicit dated NAV/share anchors", () => {
    const growth = deriveInvestmentCompanyNavGrowth([
      { date: "2026-06-30", navPerShare: 200 },
      { date: "2025-06-30", navPerShare: 180 },
      { date: "2023-06-30", navPerShare: 140 },
      { date: "2021-06-30", navPerShare: 100 },
    ], "2026-06-30");

    expect(growth.navGrowth1y).toBeCloseTo((200 / 180) - 1, 10);
    expect(growth.navGrowth3yCagr).toBeCloseTo((200 / 140) ** (1 / 3) - 1, 10);
    expect(growth.navGrowth5yCagr).toBeCloseTo((200 / 100) ** (1 / 5) - 1, 10);

    const missingFiveYearAnchor = deriveInvestmentCompanyNavGrowth([
      { date: "2026-06-30", navPerShare: 200 },
      { date: "2023-06-30", navPerShare: 140 },
    ], "2026-06-30");
    expect(missingFiveYearAnchor.navGrowth3yCagr).not.toBeNull();
    expect(missingFiveYearAnchor.navGrowth5yCagr).toBeNull();

    expect(deriveInvestmentCompanyNavGrowth([
      { date: "2026-06-30", navPerShare: 200 },
      { date: "2023-06-30", navPerShare: 140 },
    ], "2026-06-29")).toEqual({
      navGrowth1y: null,
      navGrowth3yCagr: null,
      navGrowth5yCagr: null,
    });
  });

  it("derives annual NAV/share CAGR fail-closed without interpolating missing years", () => {
    const growth = deriveInvestmentCompanyAnnualNavGrowth([
      { year: 2025, navPerShare: 100 },
      { year: 2024, navPerShare: 90 },
      { year: 2022, navPerShare: 70 },
      { year: 2020, navPerShare: 50 },
    ], 2026);

    expect(growth.navGrowth1y).toBeCloseTo((100 / 90) - 1, 10);
    expect(growth.navGrowth3yCagr).toBeCloseTo((100 / 70) ** (1 / 3) - 1, 10);
    expect(growth.navGrowth5yCagr).toBeCloseTo((100 / 50) ** (1 / 5) - 1, 10);

    expect(deriveInvestmentCompanyAnnualNavGrowth([
      { year: 2025, navPerShare: 100 },
      { year: 2024, navPerShare: 90 },
      { year: 2022, navPerShare: 70 },
    ], 2026).navGrowth5yCagr).toBeNull();

    expect(deriveInvestmentCompanyAnnualNavGrowth([
      { year: 2025, navPerShare: 100 },
      { year: 2025, navPerShare: 99 },
    ], 2026)).toEqual({
      navGrowth1y: null,
      navGrowth3yCagr: null,
      navGrowth5yCagr: null,
    });

    expect(deriveInvestmentCompanyAnnualNavGrowth([
      { year: 2025, navPerShare: 100 },
      { year: 2022, navPerShare: 70 },
      { year: 2020, navPerShare: 50 },
    ], 2028)).toEqual({
      navGrowth1y: null,
      navGrowth3yCagr: null,
      navGrowth5yCagr: null,
    });
  });

  it("routes only issuer-official NAV histories into the specialist growth factors", () => {
    expect(officialNav).toContain("navPerShareHistory");
    expect(officialNav).toContain("annualNavPerShareHistory");
    expect(officialNav).toContain("historySource");
    expect(officialNav).toContain("parseLatourOfficialNavHistory");
    expect(officialNav).toContain("parseSvolderOfficialAnnualNavHistory");
    expect(officialNav).toContain("parseCreadesOfficialAnnualNavObservation");
    expect(officialNav).toContain("https://svolder.se/investor-relations/svolderaktien/");
    expect(officialNav).toContain("https://www.creades.se/");

    expect(provider).toContain('from "./investment-company-nav-history"');
    expect(provider).toContain("deriveInvestmentCompanyNavGrowth(");
    expect(provider).toContain("deriveInvestmentCompanyAnnualNavGrowth(");
    expect(provider).toContain("navGrowth3yCagr");
    expect(provider).toContain("navGrowth5yCagr");
    expect(provider).toContain("officialNav.data.historySource");
    expect(provider).not.toMatch(/navGrowth(?:3yCagr|5yCagr)\s*:\s*report\.market/);
    expect(provider).not.toMatch(/navGrowth(?:3yCagr|5yCagr)\s*:\s*report\.metrics/);
  });
});