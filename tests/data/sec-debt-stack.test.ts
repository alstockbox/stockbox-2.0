import { describe, expect, it } from "vitest";
import type { SecCompanyFacts } from "../../src/lib/data/sec-resolver";
import { resolveSecFinancialPeriods } from "../../src/lib/data/sec";

function facts(input: SecCompanyFacts["facts"]): SecCompanyFacts {
  return { cik: 1, entityName: "Debt Stack Fixture", facts: input };
}

describe("SEC debt stack derivation", () => {
  it("derives total debt when a standalone short-term-borrowings fact replaces commercial paper", () => {
    const fixture = facts({
      "us-gaap": {
        Revenues: {
          units: {
            USD: [{ start: "2025-05-01", end: "2026-04-30", form: "10-K", filed: "2026-06-01", fy: 2026, val: 100 }],
          },
        },
        LongTermDebtNoncurrent: {
          units: { USD: [{ end: "2026-04-30", form: "10-K", filed: "2026-06-01", val: 2_075 }] },
        },
        LongTermDebtCurrent: {
          units: { USD: [{ end: "2026-04-30", form: "10-K", filed: "2026-06-01", val: 344 }] },
        },
        ShortTermBorrowings: {
          units: { USD: [{ end: "2026-04-30", form: "10-K", filed: "2026-06-01", val: 282 }] },
        },
      },
    });

    const period = resolveSecFinancialPeriods(fixture).annualPeriods[0];
    expect(period?.totalDebt).toBe(2_701);
    expect(period?.provenance?.totalDebt).toEqual(expect.objectContaining({
      provider: "sec",
      valueKind: "derived",
      periodEnd: "2026-04-30",
      inputs: ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings"],
    }));
  });

  it("does not sum commercial paper with an overlapping short-term-borrowings aggregate", () => {
    const fixture = facts({
      "us-gaap": {
        Revenues: {
          units: {
            USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 100 }],
          },
        },
        LongTermDebtNoncurrent: {
          units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 71 }] },
        },
        LongTermDebtCurrent: {
          units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 11 }] },
        },
        CommercialPaper: {
          units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 2 }] },
        },
        ShortTermBorrowings: {
          units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 3 }] },
        },
      },
    });

    expect(resolveSecFinancialPeriods(fixture).annualPeriods[0]?.totalDebt).toBeNull();
  });
});
