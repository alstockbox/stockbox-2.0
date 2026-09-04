import { describe, expect, it } from "vitest";
import type { SecCompanyFacts } from "../../src/lib/data/sec-resolver";
import { resolveSecFinancialPeriods } from "../../src/lib/data/sec";

function facts(input: SecCompanyFacts["facts"]): SecCompanyFacts {
  return { cik: 1, entityName: "Comparative Filing Fixture", facts: input };
}

describe("SEC canonical fiscal-year semantics", () => {
  it("uses the economic period end year when a later filing reports comparative facts under its own fy", () => {
    const fixture = facts({
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: {
            USD: [
              {
                start: "2023-01-01",
                end: "2023-12-31",
                form: "10-K",
                filed: "2025-02-01",
                fy: 2025,
                val: 100,
              },
              {
                start: "2024-01-01",
                end: "2024-12-31",
                form: "10-K",
                filed: "2025-02-01",
                fy: 2025,
                val: 120,
              },
            ],
          },
        },
      },
    });

    const periods = resolveSecFinancialPeriods(fixture).annualPeriods;
    const byEnd = new Map(periods.map((period) => [period.periodEndDate, period]));

    expect(byEnd.get("2023-12-31")?.fiscalYear).toBe(2023);
    expect(byEnd.get("2024-12-31")?.fiscalYear).toBe(2024);
  });
});
