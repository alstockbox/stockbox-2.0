import { describe, expect, it } from "vitest";
import { resolveFinancialArchetype } from "../../src/lib/analysis/archetypes";
import type { FinancialAnalysisInput } from "../../src/lib/analysis/types";

function explicitAssetManagerWithOperatingEconomics(): FinancialAnalysisInput {
  return {
    company: {
      sector: "financials",
      industry: "Asset Management",
      analysisArchetype: "asset_manager",
      name: "Global Alternative Asset Manager",
    },
    annualPeriods: [2024, 2025].map((fiscalYear, index) => ({
      fiscalYear,
      periodEndDate: `${fiscalYear}-12-31`,
      revenue: 100 + index * 10,
      grossProfit: 80 + index * 8,
      operatingIncome: 30 + index * 3,
      operatingCashFlow: 20 + index * 2,
      netIncome: 80 + index * 8,
      totalAssets: 1_000 + index * 100,
      totalEquity: 700 + index * 70,
    })),
    analysisDate: "2026-09-06T17:35:00.000Z",
  };
}

function genuineInvestmentHoldingEconomics(): FinancialAnalysisInput {
  return {
    company: {
      sector: "financials",
      industry: "Investment Holding Company",
      analysisArchetype: "holding_company",
      name: "Long-Term Investment Holdings AB",
    },
    annualPeriods: [2024, 2025].map((fiscalYear, index) => ({
      fiscalYear,
      periodEndDate: `${fiscalYear}-12-31`,
      revenue: 100 + index * 10,
      grossProfit: null,
      operatingIncome: null,
      operatingCashFlow: null,
      netIncome: 80 + index * 8,
      totalAssets: 1_000 + index * 100,
      totalEquity: 700 + index * 70,
    })),
    analysisDate: "2026-09-06T17:35:00.000Z",
  };
}

describe("asset-manager versus investment-holding financial signature boundary", () => {
  it("keeps an explicitly identified operating asset manager on the asset-manager model even when investment-gain heuristics also match", () => {
    expect(resolveFinancialArchetype(explicitAssetManagerWithOperatingEconomics())).toBe("asset_manager");
  });

  it("preserves the NAV/SOTP model for a genuine non-operating investment holding company", () => {
    expect(resolveFinancialArchetype(genuineInvestmentHoldingEconomics())).toBe("holding_company");
  });
});
