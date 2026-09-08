import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveInvestmentCompanyDividendQuality } from "@/lib/data/investment-company-dividend-quality";
import {
  parseIndustrivardenOfficialKeyRatios,
  type InvestmentCompanyKeyRatioYear,
} from "@/lib/data/official-investment-company-key-ratios";

function point(
  year: number,
  overrides: Partial<InvestmentCompanyKeyRatioYear> = {},
): InvestmentCompanyKeyRatioYear {
  return {
    year,
    debtEquitiesRatio: 0.08,
    portfolioReturn: 0.12,
    benchmarkReturnSixrx: 0.08,
    netPurchasesSales: 2_000_000_000,
    netDebt: 10_000_000_000,
    navPerShare: 400,
    sharesOutstanding: 400_000_000,
    dividendsPaid: 2_800_000_000,
    dividendPerShare: 7,
    dividendsReceived: 6_000_000_000,
    ...overrides,
  };
}

function history(): InvestmentCompanyKeyRatioYear[] {
  return [point(2025), point(2024), point(2023), point(2022), point(2021), point(2020)];
}

function industrivardenFixture(): string {
  return `
    <table>
      <tr><th>2025</th><th>2024</th><th>2023</th><th>2022</th><th>2021</th></tr>
      <tr><td>Net debt</td></tr>
      <tr><td>Debt-equities ratio, %</td><td>8</td><td>7.5</td><td>7</td><td>6.8</td><td>6.5</td></tr>
      <tr><td>Number of shares outstanding</td></tr>
      <tr><td>Total, thousands</td><td>400000</td><td>400000</td><td>400000</td><td>400000</td><td>400000</td></tr>
      <tr><td>Dividends paid</td></tr>
      <tr><td>Value, SEK m.</td><td>2800</td><td>2800</td><td>2800</td><td>2800</td><td>2800</td></tr>
      <tr><td>Value per share, SEK</td><td>7</td><td>7</td><td>7</td><td>7</td><td>7</td></tr>
      <tr><td>Other key ratios</td></tr>
      <tr><td>Dividends received, SEK m.</td><td>6000</td><td>5800</td><td>5600</td><td>5400</td><td>5200</td></tr>
    </table>
  `;
}

describe("Investment-company dividend quality V3", () => {
  it("scores only from five consecutive issuer years with complete dividend funding evidence", () => {
    const result = deriveInvestmentCompanyDividendQuality(history());
    expect(result.score).not.toBeNull();
    expect(result.reason).toBeNull();
    expect(result.yearsUsed).toEqual([2025, 2024, 2023, 2022, 2021]);
    expect(result.fundingBuffer).toBeGreaterThan(2);
    expect(result.continuity).toBe(1);
  });

  it("fails closed when dividend history is non-consecutive", () => {
    const result = deriveInvestmentCompanyDividendQuality(history().filter((item) => item.year !== 2023));
    expect(result.score).toBeNull();
    expect(result.reason).toBe("insufficient_consecutive_dividend_history");
  });

  it("fails closed when received-dividend funding evidence is incomplete", () => {
    const broken = history();
    broken[1] = point(2024, { dividendsReceived: null });
    const result = deriveInvestmentCompanyDividendQuality(broken);
    expect(result.score).toBeNull();
    expect(result.reason).toBe("incomplete_dividend_evidence");
  });

  it("fails closed when total dividends do not reconcile with shares times dividend per share", () => {
    const broken = history();
    broken[0] = point(2025, { dividendsPaid: 3_500_000_000 });
    const result = deriveInvestmentCompanyDividendQuality(broken);
    expect(result.score).toBeNull();
    expect(result.reason).toBe("dividend_accounting_reconciliation_failed");
  });

  it("parses Industrivarden dividend fields with explicit published units", () => {
    const parsed = parseIndustrivardenOfficialKeyRatios(industrivardenFixture());
    expect(parsed).not.toBeNull();
    expect(parsed?.years[0]).toMatchObject({
      year: 2025,
      sharesOutstanding: 400_000_000,
      dividendsPaid: 2_800_000_000,
      dividendPerShare: 7,
      dividendsReceived: 6_000_000_000,
    });
  });

  it("feeds only filtered official annual evidence into the 4% specialist factor", () => {
    const provider = fs.readFileSync(path.join(process.cwd(), "src/lib/data/universal-security-provider.ts"), "utf8");
    expect(provider).toContain("deriveInvestmentCompanyDividendQuality");
    expect(provider).toContain("point.year <= marketYear");
    expect(provider).toContain("dividendQualityScore: dividendQuality?.score ?? null");
    expect(provider).not.toContain("dividendQualityScore: latest");
  });
});
