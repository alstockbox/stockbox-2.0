import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis/engine";
import { summarizeSourceConflicts } from "../../src/lib/analysis/source-conflicts";
import type { AnalysisArchetype, FinancialAnalysisInput, ProviderSourceConflict } from "../../src/lib/analysis/types";
import { durableCompounderInput } from "./fixtures";

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

  it.each(["marketPrice", "marketCap", "shareBasis"])(
    "always blocks an unresolved high-severity %s representation conflict",
    (metric) => {
      expect(summarizeSourceConflicts(input("standard", metric)).blocking).toBe(true);
    },
  );

  it("does not block a resolved share-basis reconciliation", () => {
    const resolved = input("standard", "shareBasis");
    resolved.sourceConflicts![0] = { ...resolved.sourceConflicts![0], resolved: true };
    expect(summarizeSourceConflicts(resolved).blocking).toBe(false);
  });

  it("forces No Rating and null scores when a high market-price conflict reaches the engine", () => {
    const conflict: ProviderSourceConflict = {
      metric: "marketPrice",
      periodEnd: null,
      primaryProvider: "adr-normalized-market",
      secondaryProvider: "primary-listing-market",
      primaryValue: 625,
      secondaryValue: 500,
      relativeDifference: 0.2,
      severity: "high",
      kind: "share_basis_mismatch",
      resolved: false,
      reason: "Primary listing price conflicts materially with the normalized ADR-implied underlying price.",
    };
    const result = analyzeFinancials({
      ...durableCompounderInput,
      sourceConflicts: [conflict],
    });

    expect(result.dataStatus).toBe("unavailable");
    expect(result.scores.stockBoxScore).toBeNull();
    expect(result.scores.personalizedScore).toBeNull();
    expect(result.recommendation.rating).toBe("No Rating");
    expect(result.sourceConflicts).toEqual(expect.arrayContaining([expect.objectContaining({ metric: "marketPrice", severity: "high" })]));
  });
});
