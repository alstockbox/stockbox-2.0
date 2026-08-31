import { describe, expect, it } from "vitest";
import {
  resolveAnnualFacts,
  resolveInstantFacts,
  resolveTtmFact,
  resolveTtmFacts,
  SEC_CONCEPTS,
  type SecCompanyFacts,
} from "../../src/lib/data/sec-resolver";
import { resolveSecFinancialPeriods } from "../../src/lib/data/sec";

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

  it("retains eleven SEC annual observations so a true 10Y CAGR can be calculated", () => {
    const rows = Array.from({ length: 12 }, (_, index) => {
      const year = 2015 + index;
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        form: "10-K",
        filed: `${year + 1}-02-01`,
        fy: year,
        val: 100 + index * 10,
      };
    });
    const fixture = facts({
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: rows } },
      },
    });

    const resolved = resolveSecFinancialPeriods(fixture).annualPeriods;
    expect(resolved).toHaveLength(11);
    expect(resolved[0]?.periodEndDate).toBe("2016-12-31");
    expect(resolved.at(-1)?.periodEndDate).toBe("2026-12-31");
  });

  it("resolves utility revenue reported inclusive of assessed tax", () => {
    const fixture = facts({
      "us-gaap": {
        RevenueFromContractWithCustomerIncludingAssessedTax: { units: { USD: [
          { start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-13", fy: 2025, val: 24_100 },
        ] } },
      },
    });

    const resolved = resolveAnnualFacts(fixture, SEC_CONCEPTS.revenue);
    expect(resolved.get("2025-12-31")).toEqual(expect.objectContaining({
      concept: "RevenueFromContractWithCustomerIncludingAssessedTax",
      val: 24_100,
    }));
  });

  it("prefers consolidated equity including noncontrolling interests for balance-sheet reconciliation", () => {
    const fixture = facts({
      "us-gaap": {
        StockholdersEquity: { units: { USD: [
          { end: "2025-12-31", form: "10-K", filed: "2026-02-13", val: 54_608 },
        ] } },
        StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest: { units: { USD: [
          { end: "2025-12-31", form: "10-K", filed: "2026-02-13", val: 66_479 },
        ] } },
      },
    });

    const resolved = resolveAnnualFacts(fixture, SEC_CONCEPTS.equity);
    expect(resolved.get("2025-12-31")).toEqual(expect.objectContaining({
      concept: "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      val: 66_479,
    }));
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

  it("does not mislabel noncurrent debt and lease obligations as total debt", () => {
    const fixture = facts({ "us-gaap": {
      Revenues: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 100 }] } },
      LongTermDebtAndCapitalLeaseObligations: { units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 13 }] } },
      LongTermDebtAndCapitalLeaseObligationsCurrent: { units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 11 }] } },
    } });
    expect(resolveSecFinancialPeriods(fixture).annualPeriods[0]?.totalDebt).toBeNull();
  });

  it("derives total debt from a non-overlapping SEC debt stack", () => {
    const fixture = facts({ "us-gaap": {
      Revenues: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 100 }] } },
      LongTermDebtNoncurrent: { units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 71 }] } },
      LongTermDebtCurrent: { units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 11 }] } },
      CommercialPaper: { units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 2 }] } },
    } });
    const period = resolveSecFinancialPeriods(fixture).annualPeriods[0];
    expect(period?.totalDebt).toBe(84);
    expect(period?.provenance?.totalDebt).toEqual(expect.objectContaining({ valueKind: "derived" }));
  });

  it("uses an explicit combined short and long debt SEC fact as total debt", () => {
    const fixture = facts({ "us-gaap": {
      Revenues: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 100 }] } },
      DebtLongtermAndShorttermCombinedAmount: { units: { USD: [{ end: "2025-12-31", form: "10-K", filed: "2026-02-01", val: 59 }] } },
    } });
    expect(resolveSecFinancialPeriods(fixture).annualPeriods[0]?.totalDebt).toBe(59);
  });

  it("does not synthesize gross profit from an incomplete SEC cost-of-revenue concept", () => {
    const fixture = facts({ "us-gaap": {
      Revenues: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 100 }] } },
      CostOfRevenue: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 20 }] } },
    } });
    const period = resolveSecFinancialPeriods(fixture).annualPeriods[0];
    expect(period?.revenue).toBe(100);
    expect(period?.costOfRevenue).toBe(20);
    expect(period?.grossProfit).toBeNull();
    expect(period?.provenance?.grossProfit).toBeUndefined();
  });

  it("marks SEC EBITDA derived from operating income plus D&A with derived provenance", () => {
    const fixture = facts({ "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 100 }] } },
      OperatingIncomeLoss: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 20 }] } },
      DepreciationDepletionAndAmortization: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-01", fy: 2025, val: 5 }] } },
    } });
    const period = resolveSecFinancialPeriods(fixture).annualPeriods[0];
    expect(period?.ebitda).toBe(25);
    expect(period?.provenance?.ebitda).toEqual(expect.objectContaining({
      provider: "sec", valueKind: "derived", inputs: ["operatingIncome", "depreciationAndAmortization"],
    }));
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
