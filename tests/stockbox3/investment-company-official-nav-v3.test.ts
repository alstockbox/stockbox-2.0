import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const navProviderPath = path.join(
  process.cwd(),
  "src/lib/data/official-investment-company-nav.ts",
);
const universalProviderPath = path.join(
  process.cwd(),
  "src/lib/data/universal-security-provider.ts",
);

describe("StockBox 3 investment-company official NAV authority", () => {
  it("uses only fresh, verified official NAV as specialist valuation evidence and never substitutes corporate balance-sheet proxies", () => {
    expect(existsSync(navProviderPath)).toBe(true);

    const navProvider = readFileSync(navProviderPath, "utf8");
    const provider = readFileSync(universalProviderPath, "utf8");

    expect(navProvider).toContain("export async function fetchOfficialInvestmentCompanyNav");
    expect(navProvider).toContain('const PROVIDER_ID = "official-investment-company-nav"');
    expect(navProvider).toContain("reportedNav: number | null");
    expect(navProvider).toContain("reportedNavPerShare: number | null");
    expect(navProvider).toContain("navAsOf: string | null");
    expect(navProvider).toContain('cache: "no-store"');
    expect(navProvider).toContain("AbortController");
    expect(navProvider).toContain("official_nav_adapter_not_configured");
    expect(navProvider).toContain("official_nav_parse_failed");

    expect(provider).toContain('from "./official-investment-company-nav"');
    expect(provider).toContain("const INVESTMENT_COMPANY_DISCLOSURE_MAX_AGE_DAYS = 120");
    expect(provider).toContain("function isOfficialDisclosureComparable");
    expect(provider).toContain("ageDays >= 0 && ageDays <= INVESTMENT_COMPANY_DISCLOSURE_MAX_AGE_DAYS");
    expect(provider).toContain("async function enrichInvestmentCompanyReport(");
    expect(provider).toContain("fetchOfficialInvestmentCompanyNav(company)");
    expect(provider).toContain("reportedNav: navComparable ? officialNav.data.reportedNav : null");
    expect(provider).toContain("reportedNavPerShare: navComparable ? officialNav.data.reportedNavPerShare : null");
    expect(provider).toContain("Official NAV dated");
    expect(provider).toContain("excluded from specialist coverage");
    expect(provider).toContain("await enrichInvestmentCompanyReport(core.data as UniversalSecurityReport, args.company)");

    expect(provider).not.toMatch(/reportedNav\s*:\s*report\.market\?\.marketCap/);
    expect(provider).not.toMatch(/reportedNav\s*:\s*latest\?\.(?:equity|stockholdersEquity|totalEquity)/);
    expect(provider).not.toMatch(/reportedNavPerShare\s*:\s*report\.market\?\.(?:price|bookValue)/);
  });
});