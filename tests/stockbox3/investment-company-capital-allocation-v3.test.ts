import { describe, expect, it } from "vitest";
import { deriveInvestmentCompanyCapitalAllocation } from "@/lib/data/investment-company-capital-allocation";
import type { InvestmentCompanyKeyRatioYear } from "@/lib/data/official-investment-company-key-ratios";
import fs from "node:fs";
import path from "node:path";

function point(
  year: number,
  overrides: Partial<InvestmentCompanyKeyRatioYear> = {},
): InvestmentCompanyKeyRatioYear {
  return {
    year,
    portfolioReturn: 0.12,
    benchmarkReturnSixrx: 0.08,
    netPurchasesSales: 2_000_000_000,
    netDebt: 10_000_000_000,
    debtEquitiesRatio: 0.08,
    navPerShare: 400,
    sharesOutstanding: 400_000_000,
    ...overrides,
  };
}

function history(): InvestmentCompanyKeyRatioYear[] {
  return [
    point(2025, { debtEquitiesRatio: 0.08 }),
    point(2024, { debtEquitiesRatio: 0.075 }),
    point(2023, { debtEquitiesRatio: 0.07 }),
    point(2022, { debtEquitiesRatio: 0.068 }),
    point(2021, { debtEquitiesRatio: 0.065 }),
    point(2020, { debtEquitiesRatio: 0.06 }),
  ];
}

describe("Investment-company capital allocation V3", () => {
  it("scores only from five consecutive annual issuer observations with benchmark and funding evidence", () => {
    const result = deriveInvestmentCompanyCapitalAllocation(history());
    expect(result.score).not.toBeNull();
    expect(result.reason).toBeNull();
    expect(result.yearsUsed).toEqual([2025, 2024, 2023, 2022, 2021]);
    expect(result.deploymentYears).toEqual([2025, 2024, 2023, 2022, 2021]);
  });

  it("fails closed when annual history is non-consecutive", () => {
    const result = deriveInvestmentCompanyCapitalAllocation(history().filter((item) => item.year !== 2023));
    expect(result.score).toBeNull();
    expect(result.reason).toBe("insufficient_consecutive_history");
  });

  it("fails closed when benchmark evidence is incomplete", () => {
    const broken = history();
    broken[1] = point(2024, { benchmarkReturnSixrx: null });
    const result = deriveInvestmentCompanyCapitalAllocation(broken);
    expect(result.score).toBeNull();
    expect(result.reason).toBe("incomplete_benchmark_history");
  });

  it("fails closed when material deployment history is insufficient", () => {
    const sparse = history().map((item, index) => ({
      ...item,
      netPurchasesSales: index < 2 ? 2_000_000_000 : 100_000_000,
    }));
    const result = deriveInvestmentCompanyCapitalAllocation(sparse);
    expect(result.score).toBeNull();
    expect(result.reason).toBe("insufficient_material_deployment_history");
  });

  it("fails closed on material share issuance because issuance terms are not verified", () => {
    const issued = history();
    issued[0] = point(2025, { sharesOutstanding: 410_000_000 });
    const result = deriveInvestmentCompanyCapitalAllocation(issued);
    expect(result.score).toBeNull();
    expect(result.reason).toBe("share_issuance_terms_unverified");
  });

  it("feeds only a verified derived score into the 12% specialist factor", () => {
    const provider = fs.readFileSync(path.join(process.cwd(), "src/lib/data/universal-security-provider.ts"), "utf8");
    expect(provider).toContain("deriveInvestmentCompanyCapitalAllocation");
    expect(provider).toContain("capitalAllocationScore: capitalAllocation?.score ?? null");
    expect(provider).not.toContain("capitalAllocationScore: latest");
  });
});
