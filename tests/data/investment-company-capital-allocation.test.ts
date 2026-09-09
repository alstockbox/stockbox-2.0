import { describe, expect, it } from "vitest";

import { deriveInvestmentCompanyCapitalAllocation } from "../../src/lib/data/investment-company-capital-allocation";
import type { InvestmentCompanyKeyRatioYear } from "../../src/lib/data/official-investment-company-key-ratios";

function point(
  year: number,
  overrides: Partial<InvestmentCompanyKeyRatioYear> = {},
): InvestmentCompanyKeyRatioYear {
  return {
    year,
    portfolioReturn: 0.10,
    benchmarkReturnSixrx: 0.10,
    netPurchasesSales: 2_000_000_000,
    netDebt: -5_000_000_000,
    debtEquitiesRatio: 0.04,
    navPerShare: 300,
    sharesOutstanding: 400_000_000,
    dividendsPaid: 3_000_000_000,
    dividendPerShare: 7.5,
    dividendsReceived: 6_000_000_000,
    ...overrides,
  };
}

function sixYearHistory(): InvestmentCompanyKeyRatioYear[] {
  return [2025, 2024, 2023, 2022, 2021, 2020].map((year) => point(year));
}

describe("investment-company capital allocation", () => {
  it("scores verified relative portfolio outcome and funding discipline without rewarding absolute bull-market returns", () => {
    const result = deriveInvestmentCompanyCapitalAllocation(sixYearHistory());

    expect(result.reason).toBeNull();
    expect(result.yearsUsed).toEqual([2025, 2024, 2023, 2022, 2021]);
    expect(result.deploymentYears).toEqual([2025, 2024, 2023, 2022, 2021]);
    expect(result.relativePortfolioCagr).toBeCloseTo(0, 12);
    expect(result.portfolioOutcomeScore).toBeCloseTo(50, 12);
    expect(result.fundingDisciplineScore).toBeCloseTo(100, 12);
    expect(result.score).toBeCloseTo(70, 12);
  });

  it("rewards verified sustained portfolio outperformance only relative to the official benchmark", () => {
    const history = sixYearHistory().map((item, index) => (
      index < 5
        ? { ...item, portfolioReturn: 0.15, benchmarkReturnSixrx: 0.05 }
        : item
    ));

    const result = deriveInvestmentCompanyCapitalAllocation(history);

    expect(result.reason).toBeNull();
    expect(result.relativePortfolioCagr).toBeCloseTo((1.15 / 1.05) - 1, 12);
    expect(result.portfolioOutcomeScore).toBe(100);
    expect(result.fundingDisciplineScore).toBeCloseTo(100, 12);
    expect(result.score).toBe(100);
  });

  it("fails closed when fewer than three years contain material positive capital deployment", () => {
    const history = sixYearHistory().map((item) => (
      item.year >= 2024 ? item : { ...item, netPurchasesSales: 0 }
    ));

    const result = deriveInvestmentCompanyCapitalAllocation(history);

    expect(result.score).toBeNull();
    expect(result.deploymentYears).toEqual([2025, 2024]);
    expect(result.reason).toBe("insufficient_material_deployment_history");
  });

  it("fails closed on material share issuance because issuance terms versus NAV are not verified", () => {
    const history = sixYearHistory().map((item) => (
      item.year === 2025 ? { ...item, sharesOutstanding: 405_000_000 } : item
    ));

    const result = deriveInvestmentCompanyCapitalAllocation(history);

    expect(result.score).toBeNull();
    expect(result.reason).toBe("share_issuance_terms_unverified");
  });

  it("fails closed when official benchmark evidence is missing from any scored year", () => {
    const history = sixYearHistory().map((item) => (
      item.year === 2023 ? { ...item, benchmarkReturnSixrx: null } : item
    ));

    const result = deriveInvestmentCompanyCapitalAllocation(history);

    expect(result.score).toBeNull();
    expect(result.reason).toBe("incomplete_benchmark_history");
  });

  it("rejects impossible compounded-return inputs and non-consecutive history", () => {
    const invalidReturn = sixYearHistory().map((item) => (
      item.year === 2022 ? { ...item, portfolioReturn: -1 } : item
    ));
    expect(deriveInvestmentCompanyCapitalAllocation(invalidReturn)).toEqual(expect.objectContaining({
      score: null,
      reason: "invalid_return_history",
    }));

    const gapped = [2025, 2024, 2023, 2021, 2020, 2019].map((year) => point(year));
    expect(deriveInvestmentCompanyCapitalAllocation(gapped)).toEqual(expect.objectContaining({
      score: null,
      reason: "insufficient_consecutive_history",
    }));
  });
});
