import { describe, expect, it } from "vitest";
import { analyzeInvestmentCompany, computeSotP } from "../../src/lib/analysis/universal-security";

describe("investment-company NAV/SOTP completeness", () => {
  it("does not manufacture component NAV by treating unknown balance-sheet adjustments as zero", () => {
    const result = analyzeInvestmentCompany({
      sharePrice: 250,
      dilutedShares: 100,
      listedHoldingsValue: 25_000,
      unlistedHoldingsValue: 5_000,
      debt: 2_000,
      otherLiabilities: 1_000,
    });

    expect(result.nav.source).toBe("unavailable");
    expect(result.nav.total).toBeNull();
    expect(result.nav.perShare).toBeNull();
  });

  it("accepts explicit verified zero adjustments when component NAV inputs are complete", () => {
    const result = analyzeInvestmentCompany({
      sharePrice: 250,
      dilutedShares: 100,
      listedHoldingsValue: 25_000,
      unlistedHoldingsValue: 5_000,
      cash: 0,
      debt: 0,
      otherLiabilities: 0,
    });

    expect(result.nav.source).toBe("component_nav");
    expect(result.nav.total).toBe(30_000);
    expect(result.nav.perShare).toBe(300);
  });

  it("does not compute SOTP equity value when balance-sheet adjustments are unknown", () => {
    const result = computeSotP([
      { name: "Listed holdings", bearValue: 20_000, baseValue: 25_000, bullValue: 30_000 },
    ], {
      dilutedShares: 100,
    });

    expect(result).toBeNull();
  });

  it("accepts explicit zero SOTP adjustments", () => {
    const result = computeSotP([
      { name: "Listed holdings", bearValue: 20_000, baseValue: 25_000, bullValue: 30_000 },
    ], {
      cash: 0,
      debt: 0,
      otherLiabilities: 0,
      dilutedShares: 100,
    });

    expect(result).toMatchObject({
      bearEquityValue: 20_000,
      baseEquityValue: 25_000,
      bullEquityValue: 30_000,
      bearNavPerShare: 200,
      baseNavPerShare: 250,
      bullNavPerShare: 300,
    });
  });
});
