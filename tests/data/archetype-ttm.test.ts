import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { resolveSecFinancialPeriods, resolveSecSpecializedData } from "../../src/lib/data/sec";
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
      InterestIncomeExpenseNet: duration(92_400, 45_000, 49_800),
      NetIncomeLoss: duration(57_048, 29_630, 37_649),
      Assets: instant(4_002_814, 4_198_000),
      StockholdersEquity: instant(345_000, 361_000),
      LoansAndLeasesReceivableNetOfDeferredIncome: instant(1_320_000, 1_380_000),
      Deposits: instant(2_400_000, 2_520_000),
    },
  },
};

describe("archetype-aware SEC TTM construction", () => {
  it.each(["reit", "insurer"] as const)("prefers full Revenues over contract-only revenue for %s", (archetype) => {
    const fixture: SecCompanyFacts = { cik: 1, entityName: "Specialist", facts: { "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: duration(10, 4, 5),
      Revenues: duration(100, 40, 55),
      NetIncomeLoss: duration(12, 5, 7),
    } } };
    const periods = resolveSecFinancialPeriods(fixture, archetype);
    expect(periods.annualPeriods.at(-1)?.revenue).toBe(100);
    expect(periods.trailingTwelveMonths?.revenue).toBe(115);
    expect(periods.trailingTwelveMonths?.provenance?.revenue.concept).toContain("Revenues");
  });

  it("prefers financial-style net revenue for unknown companies when explicitly reported", () => {
    const fixture: SecCompanyFacts = { cik: 2, entityName: "Fintech", facts: { "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: duration(20, 8, 9),
      RevenuesNetOfInterestExpense: duration(200, 90, 110),
      NetIncomeLoss: duration(8, 3, 5),
    } } };
    const periods = resolveSecFinancialPeriods(fixture, "unknown");
    expect(periods.annualPeriods.at(-1)?.revenue).toBe(200);
    expect(periods.trailingTwelveMonths?.revenue).toBe(220);
    expect(periods.trailingTwelveMonths?.provenance?.revenue.concept).toContain("RevenuesNetOfInterestExpense");
  });

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

  it("extracts reported bank metrics with SEC provenance instead of estimating them", () => {
    const specialized = resolveSecSpecializedData(jpmBankFacts, "bank");

    expect(specialized).toEqual(expect.objectContaining({
      kind: "bank",
      netInterestIncome: expect.objectContaining({ value: 97_200, dataAsOf: "2026-06-30" }),
      grossLoans: expect.objectContaining({ value: 1_380_000, dataAsOf: "2026-06-30" }),
      deposits: expect.objectContaining({ value: 2_520_000, dataAsOf: "2026-06-30" }),
    }));
    if (specialized?.kind === "bank") {
      expect(specialized.netInterestIncome.provenance?.concept).toContain("InterestIncomeExpenseNet");
      expect(specialized.cet1CapitalRatio.value).toBeNull();
    }
  });
});
