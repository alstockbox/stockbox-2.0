import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("security-aware public SEO pages", () => {
  it("detects ETF and investment-company reports from serialized universal-security output", () => {
    const page = read("src/app/aktier/[slug]/page.tsx");
    expect(page).toContain("securityAnalysis");
    expect(page).toContain("isEtf");
    expect(page).toContain("isInvestmentCompany");
    expect(page).toContain('kind === "etf"');
    expect(page).toContain('kind === "investment_company"');
  });

  it("uses security-specific metadata and structured-data entities", () => {
    const page = read("src/app/aktier/[slug]/page.tsx");
    expect(page).toContain("ETF – analys, kostnad, risk & StockBox Score");
    expect(page).toContain('"@type": "InvestmentFund"');
    expect(page).toContain('"@type": "Corporation"');
    expect(page).not.toContain('? { "@type": "FinancialProduct"');
  });

  it("renders ETF factors and investment-company NAV only when the report contains those outputs", () => {
    const page = read("src/app/aktier/[slug]/page.tsx");
    expect(page).toContain("ETF-specifika analysfaktorer");
    expect(page).toContain("Investmentbolag – substansvärde och NAV");
    expect(page).toContain("discountPremium");
    expect(page).toContain("nav.perShare");
    expect(page).toContain('href="/guider/analysera-etf"');
    expect(page).toContain('href="/guider/analysera-investmentbolag"');
  });
});
