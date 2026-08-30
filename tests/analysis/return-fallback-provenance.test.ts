import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

describe("return-metric fallback provenance", () => {
  it("labels annual fallback returns with the annual period rather than the newer TTM period", () => {
    const annualPeriods = durableCompounderInput.annualPeriods.map((period) => ({
      ...period,
      periodEndDate: `${period.fiscalYear}-12-31`,
      balanceSheetDate: `${period.fiscalYear}-12-31`,
    }));
    const currentTtm = {
      ...annualPeriods.at(-1)!,
      form: "TTM",
      periodBasis: "TTM_REPORTED" as const,
      periodEndDate: "2025-06-30",
      balanceSheetDate: "2025-06-30",
    };
    const result = analyzeFinancials({
      ...durableCompounderInput,
      analysisDate: "2025-08-25T00:00:00.000Z",
      annualPeriods,
      trailingTwelveMonths: currentTtm,
    });
    const quality = result.scores.dimensions.quality;
    const roa = (quality.contributors ?? []).find((item) => item.label === "ROA");
    const roic = (quality.contributors ?? []).find((item) => item.label === "ROIC");

    expect(roa?.value).not.toBeNull();
    expect(roic?.value).not.toBeNull();
    expect(roa?.period).toBe("2024-12-31");
    expect(roic?.period).toBe("2024-12-31");
    expect(roa?.source).toBe("StockBox deterministic formula");
    expect(roic?.source).toBe("StockBox deterministic formula");
  });
});
