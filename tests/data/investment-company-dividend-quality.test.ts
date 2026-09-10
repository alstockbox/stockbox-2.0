import { describe, expect, it } from "vitest";

import { deriveInvestmentCompanyDividendQuality } from "../../src/lib/data/investment-company-dividend-quality";
import type { InvestmentCompanyKeyRatioYear } from "../../src/lib/data/official-investment-company-key-ratios";

function year(
  yearValue: number,
  overrides: Partial<InvestmentCompanyKeyRatioYear> = {},
): InvestmentCompanyKeyRatioYear {
  const sharesOutstanding = 400_000_000;
  const dividendPerShare = 8;
  return {
    year: yearValue,
    portfolioReturn: 0.1,
    netPurchasesSales: 1_000_000_000,
    netDebt: -5_000_000_000,
    debtEquitiesRatio: 0.04,
    navPerShare: 400,
    sharesOutstanding,
    dividendsPaid: sharesOutstanding * dividendPerShare,
    dividendPerShare,
    dividendsReceived: 7_000_000_000,
    ...overrides,
  };
}

describe("investment-company dividend quality", () => {
  it("scores only the latest five consecutive verified years and exposes the funding and continuity evidence", () => {
    const result = deriveInvestmentCompanyDividendQuality([
      year(2025, { dividendPerShare: 8.75, dividendsPaid: 3_500_000_000, dividendsReceived: 9_500_000_000 }),
      year(2024, { dividendPerShare: 8.25, dividendsPaid: 3_300_000_000, dividendsReceived: 8_500_000_000 }),
      year(2023, { dividendPerShare: 7.75, dividendsPaid: 3_100_000_000, dividendsReceived: 6_400_000_000 }),
      year(2022, { dividendPerShare: 7.25, dividendsPaid: 2_900_000_000, dividendsReceived: 5_500_000_000 }),
      year(2021, { dividendPerShare: 6.75, dividendsPaid: 2_700_000_000, dividendsReceived: 8_100_000_000 }),
      year(2020, { dividendPerShare: 20, dividendsPaid: 8_000_000_000, dividendsReceived: 100_000_000 }),
    ]);

    expect(result.score).toBe(100);
    expect(result.yearsUsed).toEqual([2025, 2024, 2023, 2022, 2021]);
    expect(result.fundingBuffer).toBeCloseTo(38 / 15.5, 6);
    expect(result.continuity).toBe(1);
    expect(result.reason).toBeNull();
  });

  it("fails closed when dividends paid, shares and dividend per share do not reconcile", () => {
    const result = deriveInvestmentCompanyDividendQuality([
      year(2025, { dividendPerShare: 8, dividendsPaid: 5_000_000_000 }),
      year(2024),
      year(2023),
      year(2022),
      year(2021),
    ]);

    expect(result.score).toBeNull();
    expect(result.reason).toBe("dividend_accounting_reconciliation_failed");
  });

  it("fails closed without five consecutive annual observations", () => {
    const result = deriveInvestmentCompanyDividendQuality([
      year(2025),
      year(2024),
      year(2022),
      year(2021),
      year(2020),
    ]);

    expect(result.score).toBeNull();
    expect(result.reason).toBe("insufficient_consecutive_dividend_history");
  });

  it("does not reward uninterrupted dividends when upstream dividend funding is weak", () => {
    const result = deriveInvestmentCompanyDividendQuality([
      year(2025, { dividendsReceived: 1_600_000_000 }),
      year(2024, { dividendsReceived: 1_600_000_000 }),
      year(2023, { dividendsReceived: 1_600_000_000 }),
      year(2022, { dividendsReceived: 1_600_000_000 }),
      year(2021, { dividendsReceived: 1_600_000_000 }),
    ]);

    expect(result.continuity).toBe(1);
    expect(result.fundingBuffer).toBeCloseTo(0.5, 6);
    expect(result.score).toBe(20);
  });
});