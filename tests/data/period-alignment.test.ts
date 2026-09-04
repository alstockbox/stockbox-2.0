import { describe, expect, it } from "vitest";
import type { FinancialPeriod } from "../../src/lib/analysis/types";
import { periodsSemanticallyMatch } from "../../src/lib/data/period-alignment";

function period(overrides: Partial<FinancialPeriod>): FinancialPeriod {
  return {
    periodEndDate: "2025-12-31",
    periodBasis: "FY",
    fiscalYear: 2025,
    currency: "USD",
    ...overrides,
  } as FinancialPeriod;
}

describe("cross-provider economic period alignment", () => {
  it("matches 52/53-week fiscal-year ends to provider month-end normalization", () => {
    const sec = period({ periodEndDate: "2025-09-28", fiscalYear: 2025, periodBasis: "FY", form: "10-K" });
    const yahoo = period({ periodEndDate: "2025-09-30", fiscalYear: 2025, periodBasis: "FY", form: "FY" });
    expect(periodsSemanticallyMatch(sec, yahoo)).toBe(true);
  });

  it("matches economically current TTM periods despite different construction labels", () => {
    const sec = period({ periodEndDate: "2026-06-28", fiscalYear: undefined, periodBasis: "TTM_Q3_9M", form: "TTM" });
    const yahoo = period({ periodEndDate: "2026-06-30", fiscalYear: 2026, periodBasis: "TTM_REPORTED", form: "TTM" });
    expect(periodsSemanticallyMatch(sec, yahoo)).toBe(true);
  });

  it("does not merge annual and TTM periods even when their end dates coincide", () => {
    const annual = period({ periodEndDate: "2026-06-30", fiscalYear: 2026, periodBasis: "FY", form: "10-K" });
    const ttm = period({ periodEndDate: "2026-06-30", fiscalYear: undefined, periodBasis: "TTM_Q3_9M", form: "TTM" });
    expect(periodsSemanticallyMatch(annual, ttm)).toBe(false);
  });

  it("does not merge distinct fiscal years", () => {
    const left = period({ periodEndDate: "2024-12-29", fiscalYear: 2024, periodBasis: "FY" });
    const right = period({ periodEndDate: "2025-01-03", fiscalYear: 2025, periodBasis: "FY" });
    expect(periodsSemanticallyMatch(left, right)).toBe(false);
  });

  it("does not merge periods whose dates are too far apart", () => {
    const left = period({ periodEndDate: "2025-09-15", fiscalYear: 2025, periodBasis: "FY" });
    const right = period({ periodEndDate: "2025-09-30", fiscalYear: 2025, periodBasis: "FY" });
    expect(periodsSemanticallyMatch(left, right)).toBe(false);
  });
});
