import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveInvestmentCompanyDividendQuality } from "@/lib/data/investment-company-dividend-quality";
import { getOfficialInvestmentCompanyDividendHistory } from "@/lib/data/official-investment-company-dividend-history";

const lundbergs = {
  ticker: "LUND-B.ST",
  canonicalTicker: "LUND-B.ST",
  name: "L E Lundbergföretagen AB B",
  exchange: "STO",
  currency: "SEK",
  securityType: "Common Stock" as const,
};

describe("StockBox 3 Lundbergs dividend-history authority", () => {
  it("provides five consecutive issuer-published cash-dividend years with explicit units", () => {
    const data = getOfficialInvestmentCompanyDividendHistory(lundbergs);
    expect(data).not.toBeNull();
    expect(data?.years).toEqual([
      { year: 2025, sharesOutstanding: 248_000_000, dividendsPaid: 1_141_000_000, dividendPerShare: 4.60, dividendsReceived: 3_414_000_000 },
      { year: 2024, sharesOutstanding: 248_000_000, dividendsPaid: 1_066_000_000, dividendPerShare: 4.30, dividendsReceived: 3_146_000_000 },
      { year: 2023, sharesOutstanding: 248_000_000, dividendsPaid: 992_000_000, dividendPerShare: 4.00, dividendsReceived: 3_000_000_000 },
      { year: 2022, sharesOutstanding: 248_000_000, dividendsPaid: 930_000_000, dividendPerShare: 3.75, dividendsReceived: 2_476_000_000 },
      { year: 2021, sharesOutstanding: 248_000_000, dividendsPaid: 868_000_000, dividendPerShare: 3.50, dividendsReceived: 2_415_000_000 },
    ]);
    expect(data?.source.url).toBe("https://www.lundbergforetagen.se/sites/default/files/2026-03/Lundbergs_Annual_Report_2025web.pdf");
    expect(data?.source.dataAsOf).toBe("2025-12-31");
  });

  it("aligns dividend per share to the cash payment year instead of the later proposed dividend", () => {
    const data = getOfficialInvestmentCompanyDividendHistory(lundbergs);
    expect(data?.years[0]?.dividendPerShare).toBe(4.60);
    expect(data?.years[0]?.dividendPerShare).not.toBe(4.90);
    expect(data?.years[0]?.dividendsPaid).toBe(1_141_000_000);
  });

  it("passes the existing dividend-quality accounting reconciliation without invented funding data", () => {
    const data = getOfficialInvestmentCompanyDividendHistory(lundbergs);
    const result = deriveInvestmentCompanyDividendQuality(data?.years ?? []);
    expect(result.reason).toBeNull();
    expect(result.yearsUsed).toEqual([2025, 2024, 2023, 2022, 2021]);
    expect(result.fundingBuffer).toBeCloseTo(14_451 / 4_997, 8);
    expect(result.continuity).toBe(1);
    expect(result.score).toBe(100);
  });

  it("is a dividend-only authority and cannot leak consolidated financing into leverage or capital allocation", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/data/official-investment-company-dividend-history.ts"),
      "utf8",
    );
    expect(source).not.toContain("debtEquitiesRatio");
    expect(source).not.toContain("netDebt");
    expect(source).not.toContain("portfolioReturn");
    expect(source).not.toContain("benchmarkReturnSixrx");
    expect(source).not.toContain("netPurchasesSales");
  });

  it("cuts dedicated dividend history off strictly before the historical market year", () => {
    const provider = fs.readFileSync(
      path.join(process.cwd(), "src/lib/data/universal-security-provider.ts"),
      "utf8",
    );
    expect(provider).toMatch(
      /officialDividendHistory\.years\.filter\(\s*\(point\)\s*=>\s*point\.year\s*<\s*marketYear\s*,?\s*\)/,
    );
  });

  it("wires dedicated dividend history only into the 4% dividend-quality factor", () => {
    const provider = fs.readFileSync(
      path.join(process.cwd(), "src/lib/data/universal-security-provider.ts"),
      "utf8",
    );
    expect(provider).toContain("getOfficialInvestmentCompanyDividendHistory");
    expect(provider).toContain("officialDividendHistory");
    expect(provider).toMatch(/deriveInvestmentCompanyDividendQuality\([\s\S]*officialDividendHistory/);
    expect(provider).not.toMatch(/selectVerifiedAnnualLeverageRatio\([\s\S]{0,300}officialDividendHistory/);
    expect(provider).not.toMatch(/deriveInvestmentCompanyCapitalAllocation\([\s\S]{0,300}officialDividendHistory/);
  });
});
