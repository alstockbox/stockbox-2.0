import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { resolveSecFinancialPeriods, resolveSecSpecializedData } from "../../src/lib/data/sec";
import type { SecCompanyFacts, SecFactUnit } from "../../src/lib/data/sec-resolver";

function duration(annual: number, priorYtd: number, currentYtd: number, previousAnnual?: number) {
  return {
    units: {
      USD: [
        ...(previousAnnual === undefined ? [] : [{ start: "2024-01-01", end: "2024-12-31", form: "10-K", filed: "2025-02-13", val: previousAnnual }]),
        { start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-13", val: annual },
        { start: "2025-01-01", end: "2025-06-30", form: "10-Q", filed: "2025-08-05", val: priorYtd },
        { start: "2026-01-01", end: "2026-06-30", form: "10-Q", filed: "2026-08-06", val: currentYtd },
      ] satisfies SecFactUnit[],
    },
  };
}

function instant(annual: number, current: number, previousAnnual?: number) {
  return {
    units: {
      USD: [
        ...(previousAnnual === undefined ? [] : [{ end: "2024-12-31", form: "10-K", filed: "2025-02-13", val: previousAnnual }]),
        { end: "2025-12-31", form: "10-K", filed: "2026-02-13", val: annual },
        { end: "2026-06-30", form: "10-Q", filed: "2026-08-06", val: current },
      ] satisfies SecFactUnit[],
    },
  };
}

function shareInstant(annual: number, current: number) {
  return {
    units: {
      shares: [
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
      InterestIncomeExpenseNet: duration(92_400, 45_000, 49_800, 85_000),
      NetIncomeLoss: duration(57_048, 29_630, 37_649, 45_000),
      Assets: instant(4_002_814, 4_198_000, 3_875_393),
      StockholdersEquity: instant(345_000, 361_000, 320_000),
      LoansAndLeasesReceivableNetOfDeferredIncome: instant(1_320_000, 1_380_000, 1_250_000),
      Deposits: instant(2_400_000, 2_520_000, 2_250_000),
      ProvisionForLoanLeaseAndOtherLosses: duration(5_500, 2_100, 3_400, 4_800),
      NoninterestIncome: duration(70_000, 34_000, 38_000, 65_000),
      NoninterestExpense: duration(80_000, 39_000, 43_000, 76_000),
      FinancingReceivableRecordedInvestmentNonaccrualStatus: instant(16_000, 15_000, 14_000),
      FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossWriteoff: duration(12_000, 5_000, 7_000, 10_000),
      FinancingReceivableExcludingAccruedInterestAllowanceForCreditLossRecovery: duration(3_000, 1_000, 2_000, 2_500),
      Goodwill: instant(40_000, 42_000, 38_000),
      FiniteLivedIntangibleAssetsNet: instant(5_000, 4_000, 6_000),
    },
    dei: {
      EntityCommonStockSharesOutstanding: shareInstant(11_500, 12_000),
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
      depositGrowth: expect.objectContaining({ value: expect.closeTo(2_400_000 / 2_250_000 - 1, 8) }),
      netInterestIncomeGrowth: expect.objectContaining({ value: expect.closeTo(92_400 / 85_000 - 1, 8) }),
      grossLoanGrowth: expect.objectContaining({ value: expect.closeTo(1_320_000 / 1_250_000 - 1, 8) }),
      tangibleCommonEquity: expect.objectContaining({ value: 315_000, dataAsOf: "2026-06-30" }),
      tangibleBookValuePerShare: expect.objectContaining({ value: expect.closeTo(315_000 / 12_000, 8) }),
      nonPerformingLoans: expect.objectContaining({ value: 15_000, dataAsOf: "2026-06-30" }),
      netChargeOffs: expect.objectContaining({ value: 10_000, dataAsOf: "2026-06-30" }),
      loanLossProvisions: expect.objectContaining({ value: 6_800, dataAsOf: "2026-06-30" }),
      efficiencyRatio: expect.objectContaining({ value: expect.closeTo(84_000 / (97_200 + 74_000), 8) }),
      returnOnAssets: expect.objectContaining({ value: expect.closeTo(57_048 / ((3_875_393 + 4_002_814) / 2), 8) }),
      returnOnEquity: expect.objectContaining({ value: expect.closeTo(57_048 / ((320_000 + 345_000) / 2), 8) }),
      returnOnTangibleCommonEquity: expect.objectContaining({ value: expect.closeTo(57_048 / ((276_000 + 300_000) / 2), 8) }),
    }));
    if (specialized?.kind === "bank") {
      expect(specialized.netInterestIncome.provenance?.concept).toContain("InterestIncomeExpenseNet");
      expect(specialized.cet1CapitalRatio.value).toBeNull();
      expect(specialized.netChargeOffs.provenance?.inputs).toEqual(expect.arrayContaining([
        expect.stringContaining("Writeoff"),
        expect.stringContaining("Recovery"),
      ]));
    }
  });
});
