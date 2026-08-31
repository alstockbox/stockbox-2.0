import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoricalResearchView } from "../../src/components/analysis/historical-research";
import { buildHistoricalResearchData } from "../../src/lib/analysis/historical";
import type { AnalysisReport, FinancialPeriod, HistoricalResearchData, HistoricalTtmEpsPoint, MarketDividendEvent, MarketPricePoint } from "../../src/lib/analysis/types";

type FutureCoverageItem = {
  requestedYears: 10;
  availableYears: number;
  observationCount: number;
  status: "full" | "partial" | "unavailable" | "not_applicable";
};
type FutureCoverage = {
  methodVersion: string;
  financials: FutureCoverageItem;
  price: FutureCoverageItem;
  valuation: FutureCoverageItem;
  dividend: FutureCoverageItem & { eventCoverageYears?: number };
};

function withCoverage(historical: HistoricalResearchData) {
  return historical as HistoricalResearchData & { coverage?: FutureCoverage };
}

function period(year: number, index: number, overrides: Partial<FinancialPeriod> = {}): FinancialPeriod {
  const scale = 1.04 ** index;
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    currency: "USD",
    revenue: 1_000 * scale,
    grossProfit: 600 * scale,
    operatingIncome: 250 * scale,
    netIncome: 180 * scale,
    epsDiluted: 2 * scale,
    operatingCashFlow: 260 * scale,
    capitalExpenditures: 60 * scale,
    cashAndEquivalents: 200,
    totalDebt: 100,
    totalEquity: 800,
    totalAssets: 1_200,
    currentAssets: 500,
    currentLiabilities: 250,
    interestExpense: 10,
    pretaxIncome: 220 * scale,
    incomeTaxExpense: 40 * scale,
    sharesDiluted: 100,
    dividendsPaid: -(50 * scale),
    ...overrides,
  };
}

function monthlyPrices(startYear: number, endYear: number): MarketPricePoint[] {
  const result: MarketPricePoint[] = [];
  let value = 20;
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      if (year === endYear && month > 8) break;
      result.push({ date: `${year}-${String(month).padStart(2, "0")}-28`, close: value });
      value += 0.25;
    }
  }
  return result;
}

function quarterlyTtmEps(startYear: number, endYear: number, latestOverride?: number): HistoricalTtmEpsPoint[] {
  const result: HistoricalTtmEpsPoint[] = [];
  let index = 0;
  for (let year = startYear; year <= endYear; year += 1) {
    for (const month of [2, 5, 8, 11]) {
      if (year === endYear && month > 8) break;
      result.push({
        periodEndDate: `${year}-${String(month).padStart(2, "0")}-28`,
        epsDiluted: 2 + index * 0.02,
        currency: "USD",
        basis: "TTM_FROM_QUARTERS",
        provenance: { source: "fixture", valueKind: "derived" },
      });
      index += 1;
    }
  }
  if (latestOverride !== undefined && result.length) result[result.length - 1].epsDiluted = latestOverride;
  return result;
}

const dividendEvents: MarketDividendEvent[] = [
  { date: "2025-09-15", amount: 0.2, currency: "USD" },
  { date: "2025-12-15", amount: 0.2, currency: "USD" },
  { date: "2026-03-15", amount: 0.2, currency: "USD" },
  { date: "2026-06-15", amount: 0.2, currency: "USD" },
];

describe("historical coverage integrity P0", () => {
  it("records requested 10Y versus actual six-year coverage without relabeling it as 10Y", () => {
    const historical = withCoverage(buildHistoricalResearchData(
      Array.from({ length: 6 }, (_, index) => period(2021 + index, index)),
      monthlyPrices(2021, 2026),
      {
        ttmEpsHistory: quarterlyTtmEps(2021, 2026),
        dividendEvents,
        currentPrice: 40,
        currentPriceDate: "2026-08-31",
        currentPriceEarnings: 18,
      },
    ));

    expect(historical.coverage?.methodVersion).toBe("historical-coverage-v1");
    expect(historical.coverage?.financials.requestedYears).toBe(10);
    expect(historical.coverage?.financials.availableYears).toBe(6);
    expect(historical.coverage?.financials.status).toBe("partial");
    expect(historical.coverage?.price.status).toBe("partial");
    expect(historical.coverage?.price.availableYears).toBeGreaterThan(5);
    expect(historical.coverage?.valuation.status).toBe("partial");
    expect(historical.coverage?.dividend.status).toBe("partial");
  });

  it("marks genuinely sufficient ten-year histories as full", () => {
    const historical = withCoverage(buildHistoricalResearchData(
      Array.from({ length: 11 }, (_, index) => period(2016 + index, index)),
      monthlyPrices(2016, 2026),
      {
        ttmEpsHistory: quarterlyTtmEps(2016, 2026),
        dividendEvents,
        currentPrice: 50,
        currentPriceDate: "2026-08-31",
        currentPriceEarnings: 20,
      },
    ));

    expect(historical.coverage?.financials.status).toBe("full");
    expect(historical.coverage?.price.status).toBe("full");
    expect(historical.coverage?.valuation.status).toBe("full");
  });

  it("distinguishes current P/E not meaningful from unavailable when latest TTM EPS is negative", () => {
    const historical = buildHistoricalResearchData(
      Array.from({ length: 4 }, (_, index) => period(2023 + index, index)),
      monthlyPrices(2023, 2026),
      {
        ttmEpsHistory: quarterlyTtmEps(2023, 2026, -1),
        currentPrice: 30,
        currentPriceDate: "2026-08-31",
        currentPriceEarnings: null,
      },
    );

    expect(historical.valuationContext?.currentPriceEarningsStatus).toBe("not_meaningful");

    const report = {
      ticker: "LOSS",
      companyName: "Loss Fixture",
      investmentProfile: "balanced",
      reportingCurrency: "USD",
      market: { price: 30, currency: "USD" },
      historical,
    } as AnalysisReport;
    const html = renderToStaticMarkup(createElement(HistoricalResearchView, { report, mode: "simple", locale: "en" }));
    expect(html).toContain("N/M — negative earnings");
  });

  it("renders historical coverage as a separate Simple Mode product feature", () => {
    const historical = buildHistoricalResearchData(
      Array.from({ length: 6 }, (_, index) => period(2021 + index, index)),
      monthlyPrices(2021, 2026),
      {
        ttmEpsHistory: quarterlyTtmEps(2021, 2026),
        dividendEvents,
        currentPrice: 40,
        currentPriceDate: "2026-08-31",
        currentPriceEarnings: 18,
      },
    );
    const report = {
      ticker: "COV",
      companyName: "Coverage Fixture",
      investmentProfile: "balanced",
      reportingCurrency: "USD",
      market: { price: 40, currency: "USD" },
      historical,
      dataCoverage: 0.78,
      score: { confidence: 64 },
    } as AnalysisReport;

    const html = renderToStaticMarkup(createElement(HistoricalResearchView, { report, mode: "simple", locale: "en" }));
    expect(html).toContain("Historical coverage");
    expect(html).toContain("Financials");
    expect(html).toContain("6/10 years");
    expect(html).toContain("Price history");
    expect(html).toContain("Valuation history");
    expect(html).toContain("Dividend history");
    expect(html).toContain("Coverage is separate from model confidence");
    expect(html).toContain("Insufficient history");
  });
});
