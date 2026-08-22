import { describe, expect, it } from "vitest";
import {
  resolveAnnualFacts,
  resolveTtmFact,
  SEC_CONCEPTS,
  type SecCompanyFacts,
} from "../../src/lib/data/sec-resolver";

function facts(input: SecCompanyFacts["facts"]): SecCompanyFacts {
  return { cik: 1, entityName: "Fixture Corp", facts: input };
}

describe("SEC XBRL fact resolver", () => {
  it("merges older and newer revenue aliases without losing years", () => {
    const fixture = facts({
      "us-gaap": {
        Revenues: { units: { USD: [{ start: "2022-01-01", end: "2022-12-31", form: "10-K", filed: "2023-02-01", fy: 2022, val: 100 }] } },
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [{ start: "2023-01-01", end: "2023-12-31", form: "10-K", filed: "2024-02-01", fy: 2023, val: 125 }] } },
      },
    });
    const resolved = resolveAnnualFacts(fixture, SEC_CONCEPTS.revenue);
    expect([...resolved.keys()]).toEqual(["2022-12-31", "2023-12-31"]);
    expect(resolved.get("2023-12-31")?.val).toBe(125);
  });

  it("uses start and end identity so comparative periods sharing fy do not collapse", () => {
    const fixture = facts({
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
          { start: "2022-01-01", end: "2022-12-31", form: "10-K", filed: "2024-02-01", fy: 2023, val: 100 },
          { start: "2023-01-01", end: "2023-12-31", form: "10-K", filed: "2024-02-01", fy: 2023, val: 120 },
        ] } },
      },
    });
    expect([...resolveAnnualFacts(fixture, SEC_CONCEPTS.revenue).values()].map((item) => item.val)).toEqual([100, 120]);
  });

  it("keeps the latest filed restatement for the same economic period", () => {
    const fixture = facts({
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
          { start: "2023-01-01", end: "2023-12-31", form: "10-K", filed: "2024-02-01", val: 120 },
          { start: "2023-01-01", end: "2023-12-31", form: "10-K/A", filed: "2024-04-01", val: 118 },
        ] } },
      },
    });
    expect(resolveAnnualFacts(fixture, SEC_CONCEPTS.revenue).get("2023-12-31")?.val).toBe(118);
  });

  it("aligns instant facts by end date and keeps the latest filing", () => {
    const fixture = facts({
      "us-gaap": {
        Assets: { units: { USD: [
          { end: "2022-12-31", form: "10-K", filed: "2023-02-01", val: 500 },
          { end: "2023-12-31", form: "10-K", filed: "2024-02-01", val: 600 },
        ] } },
      },
    });
    expect([...resolveAnnualFacts(fixture, SEC_CONCEPTS.assets).keys()]).toEqual(["2022-12-31", "2023-12-31"]);
  });

  it("resolves standardized IFRS facts without a US-GAAP concept", () => {
    const fixture = facts({
      "ifrs-full": {
        Revenue: { units: { USD: [{ start: "2023-01-01", end: "2023-12-31", form: "20-F", filed: "2024-03-01", val: 90 }] } },
      },
    });
    const value = resolveAnnualFacts(fixture, SEC_CONCEPTS.revenue).get("2023-12-31");
    expect(value?.taxonomy).toBe("ifrs-full");
    expect(value?.val).toBe(90);
  });

  it("constructs TTM as latest FY plus current matched period minus prior matched period", () => {
    const fixture = facts({
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
          { start: "2024-01-01", end: "2024-12-31", form: "10-K", filed: "2025-02-01", val: 400 },
          { start: "2024-01-01", end: "2024-06-30", form: "10-Q", filed: "2024-08-01", val: 190 },
          { start: "2025-01-01", end: "2025-06-30", form: "10-Q", filed: "2025-08-01", val: 220 },
        ] } },
      },
    });
    const ttm = resolveTtmFact(fixture, SEC_CONCEPTS.revenue);
    expect(ttm?.val).toBe(430);
    expect(ttm?.end).toBe("2025-06-30");
  });
});
