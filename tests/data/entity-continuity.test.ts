import { describe, expect, it } from "vitest";
import { mergeSecCompanyFacts, resolveSecFinancialPeriods } from "../../src/lib/data/sec";
import { nvdaModernCompanyFacts } from "./fixtures/nvda-modern-companyfacts";
import { xomPredecessorFacts, xomSuccessorFacts } from "./fixtures/xom-entity-continuity";

describe("SEC freshness and entity continuity", () => {
  it("selects NVIDIA's latest coherent modern period using ProductiveAssets capex", () => {
    const periods = resolveSecFinancialPeriods(nvdaModernCompanyFacts);

    expect(periods.trailingTwelveMonths).toEqual(expect.objectContaining({
      periodEndDate: "2026-04-26",
      balanceSheetDate: "2026-04-26",
      periodBasis: "TTM_Q1_3M",
      revenue: 253_491_000_000,
      capitalExpenditures: 6_572_000_000,
    }));
    expect(periods.trailingTwelveMonths?.provenance?.capitalExpenditures.concept).toContain("PaymentsToAcquireProductiveAssets");
    expect(periods.trailingTwelveMonths?.periodEndDate).not.toBe("2012-04-29");
  });

  it("retains XOM history across the configured predecessor and successor CIKs", () => {
    const merged = mergeSecCompanyFacts([xomPredecessorFacts, xomSuccessorFacts]);
    const periods = resolveSecFinancialPeriods(merged);

    expect(periods.annualPeriods.map((period) => period.periodEndDate)).toEqual([
      "2023-12-31",
      "2024-12-31",
      "2025-12-31",
    ]);
    expect(periods.trailingTwelveMonths).toEqual(expect.objectContaining({
      periodEndDate: "2026-06-30",
      revenue: 380,
      balanceSheetDate: "2026-06-30",
    }));
    expect(periods.trailingTwelveMonths?.provenance?.revenue.sourceCiks).toEqual([
      "0000034088",
      "0002115436",
    ]);
    expect(periods.annualPeriods[0].provenance?.revenue.sourceCik).toBe("0000034088");
    expect(periods.trailingTwelveMonths?.provenance?.totalAssets.sourceCik).toBe("0002115436");
  });
});
