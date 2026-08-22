import { describe, expect, it } from "vitest";
import {
  resolveAnnualFacts,
  resolveInstantFacts,
  resolveTtmFact,
  resolveTtmFacts,
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
    expect(ttm?.periodBasis).toBe("TTM_Q2_6M");
  });

  it("prefers Q3 cumulative 9M over quarter-only 3M facts with the same end", () => {
    const fixture = facts({
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
          { start: "2024-09-29", end: "2025-09-27", form: "10-K", filed: "2025-10-31", val: 416_161 },
          { start: "2024-09-29", end: "2025-06-28", form: "10-Q", filed: "2025-08-01", val: 313_695 },
          { start: "2025-09-28", end: "2026-06-27", form: "10-Q", filed: "2026-07-31", val: 364_357 },
          { start: "2026-03-29", end: "2026-06-27", form: "10-Q", filed: "2026-07-31", val: 109_417 },
        ] } },
      },
    });

    const ttm = resolveTtmFact(fixture, SEC_CONCEPTS.revenue);
    expect(ttm?.val).toBe(466_823);
    expect(ttm?.periodBasis).toBe("TTM_Q3_9M");
    expect(ttm?.currentYtdDurationDays).toBeGreaterThan(260);
  });

  it("prefers Q2 cumulative 6M over quarter-only 3M facts with the same end", () => {
    const fixture = facts({
      "us-gaap": {
        Revenues: { units: { USD: [
          { start: "2023-10-01", end: "2024-09-28", form: "10-K", filed: "2024-11-01", val: 400 },
          { start: "2023-10-01", end: "2024-03-30", form: "10-Q", filed: "2024-05-01", val: 190 },
          { start: "2024-09-29", end: "2025-03-29", form: "10-Q", filed: "2025-05-01", val: 220 },
          { start: "2024-12-29", end: "2025-03-29", form: "10-Q", filed: "2025-05-01", val: 115 },
        ] } },
      },
    });

    const ttm = resolveTtmFact(fixture, SEC_CONCEPTS.revenue);
    expect(ttm?.val).toBe(430);
    expect(ttm?.periodBasis).toBe("TTM_Q2_6M");
  });

  it("constructs Q1 TTM from the only valid 3M YTD duration", () => {
    const fixture = facts({
      "us-gaap": {
        Revenues: { units: { USD: [
          { start: "2023-10-01", end: "2024-09-28", form: "10-K", filed: "2024-11-01", val: 400 },
          { start: "2023-10-01", end: "2023-12-30", form: "10-Q", filed: "2024-02-01", val: 90 },
          { start: "2024-09-29", end: "2024-12-28", form: "10-Q", filed: "2025-02-01", val: 110 },
        ] } },
      },
    });

    expect(resolveTtmFact(fixture, SEC_CONCEPTS.revenue)).toEqual(
      expect.objectContaining({ val: 420, periodBasis: "TTM_Q1_3M" }),
    );
  });

  it("matches comparable YTD periods across a 53-week fiscal calendar", () => {
    const fixture = facts({
      "us-gaap": {
        Revenues: { units: { USD: [
          { start: "2023-10-01", end: "2024-10-05", form: "10-K", filed: "2024-11-08", val: 410 },
          { start: "2023-10-01", end: "2024-06-29", form: "10-Q", filed: "2024-08-01", val: 300 },
          { start: "2024-10-06", end: "2025-07-05", form: "10-Q", filed: "2025-08-01", val: 345 },
        ] } },
      },
    });

    expect(resolveTtmFact(fixture, SEC_CONCEPTS.revenue)).toEqual(
      expect.objectContaining({ val: 455, periodBasis: "TTM_Q3_9M" }),
    );
  });

  it("rejects a prior YTD with a different duration class", () => {
    const fixture = facts({
      "us-gaap": {
        Revenues: { units: { USD: [
          { start: "2024-01-01", end: "2024-12-31", form: "10-K", filed: "2025-02-01", val: 400 },
          { start: "2024-01-01", end: "2024-06-30", form: "10-Q", filed: "2024-08-01", val: 190 },
          { start: "2025-01-01", end: "2025-09-30", form: "10-Q", filed: "2025-11-01", val: 330 },
        ] } },
      },
    });

    expect(resolveTtmFacts(fixture, SEC_CONCEPTS.revenue)).toEqual([]);
  });

  it("resolves quarterly instant facts and keeps the latest amendment", () => {
    const fixture = facts({
      "us-gaap": {
        Assets: { units: { USD: [
          { end: "2025-09-27", form: "10-K", filed: "2025-10-31", val: 359 },
          { end: "2026-06-27", form: "10-Q", filed: "2026-07-31", accn: "original", val: 382 },
          { end: "2026-06-27", form: "10-Q/A", filed: "2026-08-14", accn: "amended", val: 383 },
        ] } },
      },
    });

    const resolved = resolveInstantFacts(fixture, SEC_CONCEPTS.assets);
    expect([...resolved.keys()]).toEqual(["2025-09-27", "2026-06-27"]);
    expect(resolved.get("2026-06-27")).toEqual(expect.objectContaining({ val: 383, accn: "amended" }));
  });
});
