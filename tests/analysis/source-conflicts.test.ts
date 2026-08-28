import { describe, expect, it } from "vitest";
import { summarizeSourceConflicts } from "../../src/lib/analysis/source-conflicts";
import type { AnalysisArchetype, FinancialAnalysisInput, ProviderSourceConflict } from "../../src/lib/analysis/types";

function input(archetype: AnalysisArchetype, metric: string): FinancialAnalysisInput {
  const conflict: ProviderSourceConflict = {
    metric,
    periodEnd: "2025-12-31",
    primaryProvider: "sec",
    secondaryProvider: "yahoo-fundamentals",
    primaryValue: 100,
    secondaryValue: 150,
    relativeDifference: 1 / 3,
    severity: "high",
    reason: "Latest provider definitions differ materially.",
  };
  return {
    company: { ticker: "TEST", sector: "financials", analysisArchetype: archetype },
    annualPeriods: [{ fiscalYear: 2025, periodEndDate: "2025-12-31" }],
    sourceConflicts: [conflict],
  };
}

describe("archetype-aware source conflict blocking", () => {
  it("does not block a bank for corporate cash-definition disagreement", () => {
    expect(summarizeSourceConflicts(input("bank", "cashAndEquivalents")).blocking).toBe(false);
  });

  it("still blocks a bank for current revenue disagreement", () => {
    expect(summarizeSourceConflicts(input("bank", "revenue")).blocking).toBe(true);
  });

  it("still blocks a standard company for current cash disagreement", () => {
    expect(summarizeSourceConflicts(input("standard", "cashAndEquivalents")).blocking).toBe(true);
  });

  it("does not block a REIT for corporate operating-cash-flow disagreement", () => {
    expect(summarizeSourceConflicts(input("reit", "operatingCashFlow")).blocking).toBe(false);
  });

  it("still blocks a REIT for current total-debt disagreement", () => {
    expect(summarizeSourceConflicts(input("reit", "totalDebt")).blocking).toBe(true);
  });
});
