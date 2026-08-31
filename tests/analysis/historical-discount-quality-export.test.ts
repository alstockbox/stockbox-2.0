import { describe, expect, it } from "vitest";
import { historicalFinancialsCsv } from "../../src/lib/analysis/financial-data-export";
import type { HistoricalResearchData } from "../../src/lib/analysis/types";

function fixture(): HistoricalResearchData {
  return {
    financials: [],
    price: [],
    valuation: [],
    valuationMethodVersion: "historical-valuation-v2",
    revenueCagr3y: null,
    revenueCagr5y: null,
    revenueCagr10y: null,
    epsCagr3y: null,
    epsCagr5y: null,
    epsCagr10y: null,
    dividendCagr3y: null,
    dividendCagr5y: null,
    dividendCagr10y: null,
    dividendYearsIncreased: 0,
    dividendYearsUnchanged: 0,
    dividendYearsCut: 0,
    discountQuality: {
      methodVersion: "historical-discount-quality-v1",
      status: "discount",
      classification: "STRONG",
      discountToReferenceMedian: -0.25,
      referenceWindow: "5Y",
      coverage: 0.875,
      evaluatedSignalCount: 7,
      applicableSignalCount: 8,
      deteriorationScore: 0.05,
      summary: "No material deterioration signal was found.",
      signals: [
        {
          key: "growth",
          label: "Growth deterioration",
          status: "healthy",
          detail: "Comparable revenue growth is non-negative.",
          value: 0.06,
          weight: 0.15,
        },
      ],
    },
  } as HistoricalResearchData;
}

describe("historical discount quality export", () => {
  it("exports the versioned classification, coverage and evidence signals", () => {
    const csv = historicalFinancialsCsv(fixture());

    expect(csv).toContain("historicalDiscountQuality");
    expect(csv).toContain("methodVersion,historical-discount-quality-v1");
    expect(csv).toContain("classification,STRONG");
    expect(csv).toContain("evidenceCoverage,0.875");
    expect(csv).toContain("signalKey,signalLabel,signalStatus,signalValue,signalWeight,signalDetail");
    expect(csv).toContain("growth,Growth deterioration,healthy,0.06,0.15,Comparable revenue growth is non-negative.");
  });
});
