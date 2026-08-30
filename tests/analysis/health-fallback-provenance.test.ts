import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

describe("financial-health fallback provenance", () => {
  it("labels annual fallbacks with the annual period rather than the newer incomplete TTM period", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period) => ({
      ...period,
      periodEndDate: `${period.fiscalYear}-12-31`,
      balanceSheetDate: `${period.fiscalYear}-12-31`,
    }));
    const trailingTwelveMonths = {
      ...annualPeriods.at(-1)!, form: "TTM", periodBasis: "TTM_REPORTED" as const,
      periodEndDate: "2025-06-30", balanceSheetDate: "2025-06-30",
      totalDebt: null, cashAndCashEquivalents: undefined,
      cashAndEquivalents: null, currentAssets: null, currentLiabilities: null, interestExpense: null,
    };
    const result = analyzeFinancials({ ...durableCompounderInput, analysisDate: "2025-08-25T00:00:00.000Z", annualPeriods, trailingTwelveMonths });
    const health = result.scores.dimensions.financialHealth;
    for (const label of ["Net debt / EBITDA", "Interest coverage", "Cash / debt", "Current ratio"]) {
      const item = (health.contributors ?? []).find((candidate) => candidate.label === label);
      expect(item?.value).not.toBeNull();
      expect(item?.period).toBe("2024-12-31");
      expect(item?.source).toBe("StockBox deterministic formula");
    }
  });
});
