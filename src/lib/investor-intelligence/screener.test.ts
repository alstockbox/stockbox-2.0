import { describe, expect, it } from "vitest";
import { screenCompanies, type ScreenerCompany } from "./screener";
import type { CompanyMetricSnapshot } from "./types";

function company(ticker: string, overrides: Partial<ScreenerCompany> = {}): ScreenerCompany {
  const snapshot = {
    ticker, companyName: ticker, capturedAt: "2026-08-31T00:00:00Z", analysisId: `${ticker}-analysis`,
    price: 100, priceChange1d: 0, score: 85, personalizedScore: 85, confidence: 0.9, coverage: 0.9,
    fairValue: 120, fairValueLow: 100, fairValueHigh: 140, fairValueUpside: 0.2, archetype: "standard",
    valuation: { pe: 18, forwardPe: null, ps: 3, evSales: 3, evEbitda: 12, fcfYield: 0.06, dividendYield: 0.02, historicalPePercentile: 0.2, peVs5yMedian: -0.1, peVs10yMedian: -0.15 },
    fundamentals: { revenueGrowth: 0.12, epsGrowth: 0.15, fcf: 100, fcfGrowth: 0.1, fcfMargin: 0.2, grossMargin: 0.5, operatingMargin: 0.25, netMargin: 0.2, roic: 0.18, roe: 0.22, netDebt: 0, netDebtToEbitda: 0 },
    dividend: { yield: 0.02, payoutRatio: 0.4, fcfPayoutRatio: 0.35, growth: 0.07, dividendPerShare: 2 },
    estimates: { revenueGrowth: null, epsGrowth: null, fcfGrowth: null, targetPrice: null }, dimensions: { quality: 90, financialHealth: 88, risk: 82 }, riskFlags: [], sourceMeta: {},
  } satisfies CompanyMetricSnapshot;
  return { ticker, companyName: ticker, country: "SE", exchange: "XSTO", sector: "industrials", industry: null, marketCap: 10_000_000_000, archetype: "standard", snapshot, ...overrides };
}

describe("screenCompanies", () => {
  it("requires all configured filters and excludes missing metrics", () => {
    const missing = company("MISS", { snapshot: { ...company("MISS").snapshot, fundamentals: { ...company("MISS").snapshot.fundamentals, roic: null } } });
    const results = screenCompanies([company("PASS"), missing], { metricRanges: { "fundamentals.roic": { min: 0.15 }, "valuation.pe": { max: 20 } } });
    expect(results.map((item) => item.ticker)).toEqual(["PASS"]);
  });

  it("supports company classification filters", () => {
    const results = screenCompanies([company("SE"), company("US", { country: "US", exchange: "NASDAQ" })], { countries: ["SE"], exchanges: ["XSTO"] });
    expect(results.map((item) => item.ticker)).toEqual(["SE"]);
  });
});
