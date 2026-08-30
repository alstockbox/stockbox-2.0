import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

describe("cash-flow fallback provenance", () => {
  it("uses one complete annual basis when current TTM cash-flow facts are incomplete", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period) => ({
      ...period, periodEndDate: `${period.fiscalYear}-12-31`, balanceSheetDate: `${period.fiscalYear}-12-31`,
    }));
    const trailingTwelveMonths = {
      ...annualPeriods.at(-1)!, form: "TTM", periodBasis: "TTM_REPORTED" as const,
      periodEndDate: "2025-06-30", balanceSheetDate: "2025-06-30",
      operatingCashFlow: null, capitalExpenditures: null,
    };
    const result = analyzeFinancials({
      ...durableCompounderInput, analysisDate: "2025-08-25T00:00:00.000Z",
      annualPeriods, trailingTwelveMonths,
    });
    const cash = result.scores.dimensions.cashFlow;
    const earnings = result.scores.dimensions.earningsQuality;
    for (const label of ["Simple FCF margin", "CFO margin", "FCF / net income"]) {
      const item = (cash.contributors ?? []).find((candidate) => candidate.label === label);
      expect(item?.value).not.toBeNull();
      expect(item?.period).toBe("2024-12-31");
    }
    expect((earnings.contributors ?? []).find((x) => x.label === "CFO / net income")?.period).toBe("2024-12-31");
    expect((earnings.contributors ?? []).find((x) => x.label === "Accrual ratio")?.period).toBe("2024-12-31");
  });
});
