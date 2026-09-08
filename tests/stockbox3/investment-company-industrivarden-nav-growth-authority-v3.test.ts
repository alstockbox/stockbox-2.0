import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveInvestmentCompanyAnnualNavGrowth } from "../../src/lib/data/investment-company-nav-history";
import { annualNavPerShareHistoryFromKeyRatios } from "../../src/lib/data/official-investment-company-key-ratios";

const provider = readFileSync("src/lib/data/universal-security-provider.ts", "utf8");

describe("StockBox 3 Industrivärden official NAV/share growth authority", () => {
  it("converts only explicit issuer-published annual NAV/share observations", () => {
    const history = annualNavPerShareHistoryFromKeyRatios([
      { year: 2025, debtEquitiesRatio: 0.08, navPerShare: 120 },
      { year: 2024, debtEquitiesRatio: 0.09, navPerShare: 100 },
      { year: 2023, debtEquitiesRatio: 0.1, navPerShare: 80 },
      { year: 2022, debtEquitiesRatio: 0.11, navPerShare: null },
      { year: 2021, debtEquitiesRatio: 0.12, navPerShare: 64 },
      { year: 2020, debtEquitiesRatio: 0.13, navPerShare: 0 },
      { year: 2019, debtEquitiesRatio: 0.14, navPerShare: 50 },
    ]);

    expect(history).toEqual([
      { year: 2025, navPerShare: 120 },
      { year: 2024, navPerShare: 100 },
      { year: 2023, navPerShare: 80 },
      { year: 2021, navPerShare: 64 },
      { year: 2019, navPerShare: 50 },
    ]);
  });

  it("keeps same-year full-year key-ratio NAV out of a historical market-year analysis", () => {
    const history = annualNavPerShareHistoryFromKeyRatios([
      { year: 2025, debtEquitiesRatio: 0.08, navPerShare: 120 },
      { year: 2024, debtEquitiesRatio: 0.09, navPerShare: 100 },
      { year: 2023, debtEquitiesRatio: 0.1, navPerShare: 80 },
      { year: 2021, debtEquitiesRatio: 0.12, navPerShare: 64 },
      { year: 2019, debtEquitiesRatio: 0.14, navPerShare: 50 },
    ]);
    const growth = deriveInvestmentCompanyAnnualNavGrowth(history, 2025);

    expect(growth.navGrowth1y).toBeCloseTo((100 / 80) - 1, 10);
    expect(growth.navGrowth3yCagr).toBeCloseTo((100 / 64) ** (1 / 3) - 1, 10);
    expect(growth.navGrowth5yCagr).toBeCloseTo((100 / 50) ** (1 / 5) - 1, 10);
  });

  it("wires official key-ratio NAV history as a fallback source for the specialist growth factor", () => {
    expect(provider).toContain("annualNavPerShareHistoryFromKeyRatios");
    expect(provider).toContain("keyRatioAnnualNavHistory");
    expect(provider).toMatch(/officialNav\.data\.annualNavPerShareHistory\.length\s*>\s*0/);
    expect(provider).toContain("keyRatioAnnualNavHistory");
    expect(provider).toContain("deriveInvestmentCompanyAnnualNavGrowth(");
  });
});
