import { describe, expect, it } from "vitest";
import {
  analyzeEtf,
  analyzeInvestmentCompany,
  classifyUniversalSecurity,
  computeLookThroughMetrics,
} from "../../src/lib/analysis/universal-security";

describe("universal security classification", () => {
  it("routes Investor-style holding companies to the investment-company model", () => {
    expect(classifyUniversalSecurity({
      company: { ticker: "INVE-B.ST", name: "Investor AB", securityType: "Common Stock" },
      analysisArchetype: "holding_company",
    })).toMatchObject({
      kind: "investment_company",
      analysisArchetype: "holding_company",
    });
  });

  it.each([
    ["SPY", "SPDR S&P 500 ETF Trust", "index_etf"],
    ["TQQQ", "ProShares UltraPro QQQ 3x Leveraged ETF", "leveraged_inverse_etf"],
    ["BND", "Vanguard Total Bond Market ETF", "bond_etf"],
    ["GLD", "SPDR Gold Shares Commodity ETF", "commodity_etf"],
    ["QUAL", "iShares MSCI USA Quality Factor ETF", "factor_etf"],
    ["SOXX", "iShares Semiconductor ETF", "sector_etf"],
  ])("classifies %s into the correct ETF regime", (ticker, name, kind) => {
    expect(classifyUniversalSecurity({
      company: { ticker, name, securityType: "ETF/Fund" },
      quoteType: "ETF",
    }).kind).toBe(kind);
  });
});

describe("look-through portfolio math", () => {
  it("uses weighted business metrics and harmonic positive valuation multiples", () => {
    const metrics = computeLookThroughMetrics([
      { name: "A", weight: 0.6, stockBoxScore: 90, forwardPe: 20, roic: 0.2, sector: "Industrials", country: "SE" },
      { name: "B", weight: 0.4, stockBoxScore: 70, forwardPe: 40, roic: 0.1, sector: "Technology", country: "US" },
    ]);

    expect(metrics.stockBoxQuality).toBeCloseTo(82, 8);
    expect(metrics.roic).toBeCloseTo(0.16, 8);
    expect(metrics.forwardPe).toBeCloseTo(25, 8);
    expect(metrics.holdingsHhi).toBeCloseTo(0.52, 8);
  });
});

describe("investment-company model", () => {
  it("computes component NAV, NAV/share, discount and a coverage-aware investment-company score", () => {
    const result = analyzeInvestmentCompany({
      sharePrice: 252,
      dilutedShares: 100,
      listedHoldingsValue: 25_000,
      unlistedHoldingsValue: 5_000,
      cash: 1_000,
      debt: 2_000,
      otherLiabilities: 1_000,
      navGrowth5yCagr: 0.12,
      shareholderReturn5yCagr: 0.13,
      capitalAllocationScore: 88,
      managementGovernanceScore: 85,
      diversificationScore: 75,
      dividendQualityScore: 80,
      holdings: [
        { name: "Portfolio company A", weight: 0.55, stockBoxScore: 90, forwardPe: 20 },
        { name: "Portfolio company B", weight: 0.45, stockBoxScore: 78, forwardPe: 25 },
      ],
      historicalDiscountMedian5y: -0.06,
    });

    expect(result.nav.source).toBe("component_nav");
    expect(result.nav.total).toBe(28_000);
    expect(result.nav.perShare).toBe(280);
    expect(result.nav.discountPremium).toBeCloseTo(-0.1, 8);
    expect(result.nav.relativeToHistoricalMedian).toBeCloseTo(-0.04, 8);
    expect(result.score.score).not.toBeNull();
    expect(result.score.coverage).toBeGreaterThan(0.9);
  });

  it("fails closed when verified NAV/SOTP is absent instead of substituting book equity", () => {
    const result = analyzeInvestmentCompany({
      sharePrice: 300,
      dilutedShares: 100,
      cash: 500,
      debt: 100,
    });

    const navFactor = result.score.factors.find((factor) => factor.key === "nav_valuation");
    expect(result.nav.source).toBe("unavailable");
    expect(result.nav.total).toBeNull();
    expect(navFactor).toMatchObject({ status: "missing", score: null });
    expect(result.score.score).toBeNull();
  });

  it("supports Latour-style hybrid SOTP scenarios without fabricating segment values", () => {
    const result = analyzeInvestmentCompany({
      sharePrice: 270,
      dilutedShares: 100,
      cash: 500,
      debt: 1_000,
      otherLiabilities: 250,
      sotpSegments: [
        { name: "Listed holdings", bearValue: 20_000, baseValue: 23_000, bullValue: 26_000 },
        { name: "Wholly owned operations", bearValue: 4_500, baseValue: 6_000, bullValue: 7_500 },
      ],
    });

    expect(result.sotp).toMatchObject({
      bearEquityValue: 23_750,
      baseEquityValue: 28_250,
      bullEquityValue: 32_750,
      bearNavPerShare: 237.5,
      baseNavPerShare: 282.5,
      bullNavPerShare: 327.5,
    });
    expect(result.nav.source).toBe("sotp_base");
  });
});

describe("ETF model", () => {
  it("redistributes missing factor weight instead of scoring missing tracking data as zero", () => {
    const result = analyzeEtf({
      subtype: "index_etf",
      expenseRatio: 0.0007,
      bidAskSpread: 0.0004,
      averageDailyDollarVolume: 500_000_000,
      assetsUnderManagement: 50_000_000_000,
      fundAgeYears: 15,
      numberOfHoldings: 500,
      sharpeRatio3y: 0.9,
      maxDrawdown3y: -0.22,
      structureTaxEfficiencyScore: 90,
      holdings: [
        { name: "A", weight: 0.4, stockBoxScore: 88, forwardPe: 20, priceBook: 3, freeCashFlowYield: 0.05, sector: "Technology", country: "US" },
        { name: "B", weight: 0.3, stockBoxScore: 82, forwardPe: 24, priceBook: 3.5, freeCashFlowYield: 0.04, sector: "Industrials", country: "US" },
        { name: "C", weight: 0.3, stockBoxScore: 75, forwardPe: 18, priceBook: 2.5, freeCashFlowYield: 0.06, sector: "Healthcare", country: "CH" },
      ],
    });

    const tracking = result.score.factors.find((factor) => factor.key === "tracking");
    expect(tracking).toMatchObject({ status: "missing", score: null });
    expect(result.score.score).not.toBeNull();
    expect(result.score.score).toBeGreaterThan(0);
    expect(result.score.missing).toContain("Tracking quality");
  });

  it("marks equity profitability/valuation concepts not applicable for bond ETFs", () => {
    const result = analyzeEtf({
      subtype: "bond_etf",
      expenseRatio: 0.001,
      bidAskSpread: 0.0008,
      averageDailyDollarVolume: 100_000_000,
      assetsUnderManagement: 20_000_000_000,
      fundAgeYears: 10,
      numberOfHoldings: 8_000,
      yieldToMaturity: 0.045,
      effectiveDuration: 6.2,
      investmentGradeWeight: 0.92,
      highYieldWeight: 0.08,
    });

    expect(result.score.factors.find((factor) => factor.key === "holdings_quality")?.status).toBe("not_applicable");
    expect(result.score.factors.find((factor) => factor.key === "valuation")?.status).toBe("not_applicable");
    expect(result.score.factors.find((factor) => factor.key === "bond_yield")?.status).toBe("available");
    expect(result.score.factors.find((factor) => factor.key === "bond_credit")?.status).toBe("available");
  });

  it("surfaces daily-reset/path-dependency risk for leveraged ETFs", () => {
    const result = analyzeEtf({
      subtype: "leveraged_inverse_etf",
      expenseRatio: 0.0095,
      leverageFactor: 3,
      dailyReset: true,
      volatilityDecayEstimate: 0.12,
    });

    expect(result.score.factors.find((factor) => factor.key === "path_dependency")?.status).toBe("available");
    expect(result.warnings.join(" ")).toMatch(/daily-reset|path-dependency/i);
  });
});
