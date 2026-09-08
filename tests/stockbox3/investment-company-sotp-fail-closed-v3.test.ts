import { describe, expect, it } from "vitest";
import {
  analyzeInvestmentCompany,
  computeSotP,
} from "../../src/lib/analysis/universal-security";

const segments = [
  { name: "Listed holdings", bearValue: 20_000, baseValue: 23_000, bullValue: 26_000 },
  { name: "Wholly owned operations", bearValue: 4_500, baseValue: 6_000, bullValue: 7_500 },
];

describe("Investment-company SOTP fail-closed integrity V3", () => {
  it.each([
    ["cash", { cash: null, debt: 1_000, otherLiabilities: 250 }],
    ["debt", { cash: 500, debt: null, otherLiabilities: 250 }],
    ["other liabilities", { cash: 500, debt: 1_000, otherLiabilities: null }],
  ])("does not treat missing %s as zero in SOTP", (_label, balanceSheet) => {
    const result = computeSotP(segments, {
      ...balanceSheet,
      dilutedShares: 100,
    });

    expect(result).toBeNull();
  });

  it.each([
    ["listed holdings", { listedHoldingsValue: null, unlistedHoldingsValue: 5_000, cash: 1_000, debt: 2_000, otherLiabilities: 1_000 }],
    ["unlisted holdings", { listedHoldingsValue: 25_000, unlistedHoldingsValue: null, cash: 1_000, debt: 2_000, otherLiabilities: 1_000 }],
    ["cash", { listedHoldingsValue: 25_000, unlistedHoldingsValue: 5_000, cash: null, debt: 2_000, otherLiabilities: 1_000 }],
    ["debt", { listedHoldingsValue: 25_000, unlistedHoldingsValue: 5_000, cash: 1_000, debt: null, otherLiabilities: 1_000 }],
    ["other liabilities", { listedHoldingsValue: 25_000, unlistedHoldingsValue: 5_000, cash: 1_000, debt: 2_000, otherLiabilities: null }],
  ])("does not create component NAV when %s is missing", (_label, components) => {
    const result = analyzeInvestmentCompany({
      sharePrice: 252,
      dilutedShares: 100,
      ...components,
    });

    expect(result.nav).toMatchObject({
      source: "unavailable",
      total: null,
      perShare: null,
      discountPremium: null,
    });
    expect(result.score.factors.find((factor) => factor.key === "nav_valuation")).toMatchObject({
      status: "missing",
      score: null,
    });
  });

  it("still computes SOTP and component NAV when every required balance-sheet input is explicitly verified", () => {
    const sotp = computeSotP(segments, {
      cash: 500,
      debt: 1_000,
      otherLiabilities: 250,
      dilutedShares: 100,
    });
    expect(sotp?.baseEquityValue).toBe(28_250);

    const component = analyzeInvestmentCompany({
      sharePrice: 252,
      dilutedShares: 100,
      listedHoldingsValue: 25_000,
      unlistedHoldingsValue: 5_000,
      cash: 1_000,
      debt: 2_000,
      otherLiabilities: 1_000,
    });
    expect(component.nav).toMatchObject({
      source: "component_nav",
      total: 28_000,
      perShare: 280,
    });
  });
});
