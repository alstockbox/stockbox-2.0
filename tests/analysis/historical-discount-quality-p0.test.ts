import { describe, expect, it } from "vitest";
import { evaluateHistoricalDiscountQuality } from "../../src/lib/analysis/historical-discount-quality";
import type { FinancialMetrics, HistoricalFinancialPoint, HistoricalValuationContext } from "../../src/lib/analysis/types";

function valuation(currentPe = 15, median = 20): HistoricalValuationContext {
  const window = {
    requestedYears: 5 as const,
    firstDate: "2021-06-30",
    lastDate: "2026-06-30",
    spanYears: 5,
    sufficientHistory: true,
    observationCount: 20,
    peObservationCount: 20,
    priceEarningsMedian: median,
    priceEarningsAverage: median,
    dividendYieldObservationCount: 20,
    dividendYieldAverage: 0.02,
  };
  return {
    methodVersion: "historical-valuation-v2",
    currentPriceEarnings: currentPe,
    currentDividendYield: 0.02,
    currentTrailingDividendsPerShare: 1,
    currentDividendPaymentCount: 4,
    currentPeVsReferenceMedian: currentPe / median - 1,
    referenceWindow: "5Y",
    referencePriceEarningsMedian: median,
    availableSince: "2021-06-30",
    threeYear: { ...window, requestedYears: 3, spanYears: 3 },
    fiveYear: window,
    tenYear: { ...window, requestedYears: 10, spanYears: 5, sufficientHistory: false },
    maximum: { ...window, requestedYears: null },
  };
}

function metrics(overrides: Partial<FinancialMetrics> = {}): FinancialMetrics {
  const base: FinancialMetrics = {
    latestPeriod: null,
    previousPeriod: null,
    margins: {
      grossMargin: 0.6,
      operatingMargin: 0.2,
      ebitdaMargin: 0.25,
      netMargin: 0.15,
      freeCashFlowMargin: 0.16,
      operatingCashFlowMargin: 0.2,
    },
    growth: {
      revenueGrowthYoY: 0.06,
      revenueCagr3y: 0.08,
      epsGrowthYoY: 0.08,
      epsCagr3y: 0.08,
      freeCashFlowGrowthYoY: 0.05,
      freeCashFlowCagr3y: 0.06,
      revenueCagr5y: 0.07,
      freeCashFlowPerShareCagr3y: 0.05,
      revenueGrowthBasis: "ANNUAL_YOY",
      freeCashFlowGrowthBasis: "ANNUAL_YOY",
    },
    ratios: {
      currentRatio: 1.8,
      debtToEquity: 0.4,
      netDebt: 10,
      netDebtToEbitda: 1.5,
      interestCoverage: 10,
      returnOnEquity: 0.18,
      returnOnAssets: 0.1,
      returnOnInvestedCapital: 0.16,
      cashConversion: 1.05,
      cashToDebt: 0.8,
      equityToAssets: 0.5,
      returnOnInvestedCapitalSpread: null,
    },
    valuation: {
      marketCap: 100,
      enterpriseValue: 110,
      priceEarnings: 15,
      priceSales: 2,
      priceBook: 3,
      priceTangibleBook: null,
      evSales: 2.2,
      evEbitda: 10,
      freeCashFlowYield: 0.06,
      earningsYield: 1 / 15,
      peg: 1.5,
    },
    trends: {
      operatingMarginChangeYoY: 0,
      grossMarginChangeYoY: 0,
      revenueAcceleration: 0,
      sharesDilutionYoY: 0,
    },
    cashFlow: {
      simpleFreeCashFlow: 16,
      fcff: 17,
      fcfe: null,
      normalizedTaxRate: 0.21,
      taxRateSource: "reported_normalized",
      cfoToNetIncome: 1.1,
      freeCashFlowToNetIncome: 1.05,
      accrualRatio: 0,
      stockBasedCompensationToRevenue: 0.02,
      operatingMarginStability: 0.9,
      grossMarginStability: 0.9,
      freeCashFlowStability: 0.9,
      dividendYield: 0.02,
      dividendPayoutRatio: 0.3,
      freeCashFlowPayoutRatio: 0.28,
      dividendGrowthYoY: 0.05,
      dividendCagr3y: 0.05,
    },
    provenance: {},
    missingData: [],
  };
  return {
    ...base,
    ...overrides,
    margins: { ...base.margins, ...(overrides.margins ?? {}) },
    growth: { ...base.growth, ...(overrides.growth ?? {}) },
    ratios: { ...base.ratios, ...(overrides.ratios ?? {}) },
    valuation: { ...base.valuation, ...(overrides.valuation ?? {}) },
    trends: { ...base.trends, ...(overrides.trends ?? {}) },
    cashFlow: { ...base.cashFlow, ...(overrides.cashFlow ?? {}) },
  };
}

function point(year: number, roic: number, debtToEquity: number, eps: number): HistoricalFinancialPoint {
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`, currency: "USD",
    revenue: 100, revenueGrowth: 0.05, eps, epsGrowth: 0.05, netIncome: 15,
    freeCashFlow: 16, freeCashFlowPerShare: 1.6, freeCashFlowMargin: 0.16,
    grossMargin: 0.6, operatingMargin: 0.2, netMargin: 0.15,
    returnOnEquity: 0.18, returnOnAssets: 0.1, returnOnInvestedCapital: roic,
    cash: 20, totalDebt: 30, netDebt: 10, debtToEquity, currentRatio: 1.8,
    interestCoverage: 10, sharesOutstanding: 10, shareGrowth: 0,
    dividendsPaid: 3, dividendPerShare: 0.3, dividendGrowth: 0.05,
    payoutRatio: 0.2, freeCashFlowPayoutRatio: 0.19,
    referencePrice: null, priceEarnings: null, dividendYield: null,
  };
}

const stableHistory = [
  point(2022, 0.15, 0.40, 1.8),
  point(2023, 0.16, 0.39, 2.0),
  point(2024, 0.16, 0.40, 2.2),
  point(2025, 0.17, 0.39, 2.4),
  point(2026, 0.16, 0.40, 2.6),
];

describe("historical discount quality P0", () => {
  it("classifies a meaningful historical P/E discount with stable fundamentals as STRONG", () => {
    const result = evaluateHistoricalDiscountQuality({
      valuation: valuation(15, 20), metrics: metrics(), financials: stableHistory, archetype: "standard",
    });
    expect(result.status).toBe("discount");
    expect(result.discountToReferenceMedian).toBeCloseTo(-0.25, 8);
    expect(result.classification).toBe("STRONG");
    expect(result.coverage).toBeGreaterThanOrEqual(0.9);
  });

  it("does not classify a company as discounted when current P/E is at or above history", () => {
    const result = evaluateHistoricalDiscountQuality({
      valuation: valuation(21, 20), metrics: metrics(), financials: stableHistory, archetype: "standard",
    });
    expect(result.status).toBe("not_discount");
    expect(result.classification).toBeNull();
  });

  it("downgrades a low P/E when growth, FCF, margins, dilution and cash conversion deteriorate", () => {
    const deteriorating = metrics({
      growth: { ...metrics().growth, revenueGrowthYoY: -0.14, freeCashFlowGrowthYoY: -0.30 },
      margins: { ...metrics().margins, freeCashFlowMargin: -0.04 },
      trends: { ...metrics().trends, operatingMarginChangeYoY: -0.06, sharesDilutionYoY: 0.10 },
      ratios: { ...metrics().ratios, cashConversion: 0.35 },
    });
    const history = [
      point(2022, 0.20, 0.4, 3.0),
      point(2023, 0.19, 0.45, 2.8),
      point(2024, 0.18, 0.5, 2.5),
      point(2025, 0.15, 0.7, -0.5),
      point(2026, 0.08, 1.2, -1.0),
    ];
    const result = evaluateHistoricalDiscountQuality({
      valuation: valuation(12, 20), metrics: deteriorating, financials: history, archetype: "standard",
    });
    expect(result.classification).toBe("MISLEADING");
    expect(result.signals.filter((item) => item.status === "severe").length).toBeGreaterThanOrEqual(5);
  });

  it("returns INSUFFICIENT DATA instead of treating missing inputs as healthy", () => {
    const missing = metrics({
      growth: { ...metrics().growth, revenueGrowthYoY: null, freeCashFlowGrowthYoY: null },
      margins: { ...metrics().margins, freeCashFlowMargin: null },
      trends: { ...metrics().trends, operatingMarginChangeYoY: null, sharesDilutionYoY: null },
      ratios: { ...metrics().ratios, cashConversion: null },
    });
    const result = evaluateHistoricalDiscountQuality({
      valuation: valuation(15, 20), metrics: missing, financials: [], archetype: "standard",
    });
    expect(result.classification).toBe("INSUFFICIENT DATA");
    expect(result.coverage).toBeLessThan(0.6);
  });

  it("marks unsuitable corporate metrics not-applicable rather than penalizing banks", () => {
    const result = evaluateHistoricalDiscountQuality({
      valuation: valuation(12, 16), metrics: metrics(), financials: stableHistory, archetype: "bank",
    });
    const notApplicable = result.signals.filter((item) => item.status === "not_applicable").map((item) => item.key);
    expect(notApplicable).toEqual(expect.arrayContaining(["freeCashFlow", "roic", "margins", "leverage", "cashConversion"]));
  });
});
