import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { resolveSecFinancialPeriods } from "../../src/lib/data/sec";
import type { SecCompanyFacts, SecFactUnit } from "../../src/lib/data/sec-resolver";

function duration(annual: number, priorYtd: number, currentYtd: number) {
  return {
    units: {
      USD: [
        { start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-13", val: annual },
        { start: "2025-01-01", end: "2025-06-30", form: "10-Q", filed: "2025-08-05", val: priorYtd },
        { start: "2026-01-01", end: "2026-06-30", form: "10-Q", filed: "2026-08-06", val: currentYtd },
      ] satisfies SecFactUnit[],
    },
  };
}

function instant(annual: number, current: number) {
  return {
    units: {
      USD: [
        { end: "2025-12-31", form: "10-K", filed: "2026-02-13", val: annual },
        { end: "2026-06-30", form: "10-Q", filed: "2026-08-06", val: current },
      ] satisfies SecFactUnit[],
    },
  };
}

const jpmBankFacts: SecCompanyFacts = {
  cik: 19617,
  entityName: "JPMorgan Chase & Co.",
  facts: {
    "us-gaap": {
      RevenuesNetOfInterestExpense: duration(182_447, 90_222, 107_183),
      NetIncomeLoss: duration(57_048, 29_630, 37_649),
      Assets: instant(4_002_814, 4_198_000),
      StockholdersEquity: instant(345_000, 361_000),
    },
  },
};

describe("archetype-aware SEC TTM construction", () => {
  it("constructs a current bank TTM without corporate operating income, CFO or capex", () => {
    const periods = resolveSecFinancialPeriods(jpmBankFacts, "bank");

    expect(periods.trailingTwelveMonths).toEqual(expect.objectContaining({
      periodEndDate: "2026-06-30",
      periodBasis: "TTM_Q2_6M",
      revenue: 199_408,
      netIncome: 65_067,
      operatingIncome: null,
      operatingCashFlow: null,
      capitalExpenditures: null,
    }));
    expect(periods.trailingTwelveMonths?.provenance?.revenue.concept).toContain("RevenuesNetOfInterestExpense");

    const result = analyzeFinancials({
      company: {
        ticker: "JPM",
        name: "JPMorgan Chase & Co.",
        sector: "financials",
        analysisArchetype: "bank",
      },
      ...periods,
      analysisDate: "2026-08-23T00:00:00.000Z",
    });
    expect(result.analysisArchetype).toBe("bank");
    expect(result.metrics.latestPeriod?.periodEndDate).toBe("2026-06-30");
    expect(result.metrics.cashFlow.simpleFreeCashFlow).toBeNull();
    expect(result.dcf).toEqual(expect.objectContaining({
      status: "inappropriate",
      method: "Residual income / equity multiples",
    }));
    expect(result.missingData.some((item) => item.field === "simpleFreeCashFlow")).toBe(false);
  });
});
