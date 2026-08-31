import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportView } from "../../src/components/analysis/report-view";
import { buildAnalysis } from "../../src/lib/analysis/engine";
import { buildHistoricalResearchData } from "../../src/lib/analysis/historical";
import type { AnalysisInput, FinancialPeriod, MarketPricePoint } from "../../src/lib/analysis/types";

function period(year: number, index: number, overrides: Partial<FinancialPeriod> = {}): FinancialPeriod {
  const revenue = 100 * 1.1 ** index;
  const netIncome = 20 * 1.08 ** index;
  const shares = 100;
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    currency: "USD",
    revenue,
    grossProfit: revenue * 0.6,
    operatingIncome: revenue * 0.2,
    netIncome,
    epsDiluted: 2 * 1.08 ** index,
    operatingCashFlow: 25 * 1.08 ** index,
    capitalExpenditures: 5 * 1.08 ** index,
    cashAndEquivalents: 30 + index,
    totalDebt: 50 + index,
    totalEquity: 120 + index * 5,
    totalAssets: 250 + index * 10,
    currentAssets: 80 + index * 3,
    currentLiabilities: 40 + index,
    interestExpense: 4,
    pretaxIncome: netIncome / 0.8,
    incomeTaxExpense: netIncome / 0.8 * 0.2,
    sharesDiluted: shares,
    dividendsPaid: -(4 * 1.05 ** index),
    provenance: {
      revenue: { source: "fixture", valueKind: "reported" },
    },
    ...overrides,
  };
}

function yearlyPrices(startYear: number, endYear: number): MarketPricePoint[] {
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => ({
    date: `${startYear + index}-12-31`,
    close: 20 + index * 2,
  }));
}

describe("historical research data", () => {
  it("keeps ten displayed fiscal years while using the prior observation for 10Y CAGR", () => {
    const annualPeriods = Array.from({ length: 11 }, (_, index) => period(2016 + index, index));
    const result = buildHistoricalResearchData(annualPeriods, yearlyPrices(2016, 2026));

    expect(result.financials).toHaveLength(10);
    expect(result.financials[0]?.fiscalYear).toBe(2017);
    expect(result.financials.at(-1)?.fiscalYear).toBe(2026);
    expect(result.revenueCagr3y).toBeCloseTo(0.1, 8);
    expect(result.revenueCagr5y).toBeCloseTo(0.1, 8);
    expect(result.revenueCagr10y).toBeCloseTo(0.1, 8);
    expect(result.epsCagr10y).toBeCloseTo(0.08, 8);
  });
  it("derives auditable period metrics and preserves missing-data semantics", () => {
    const annualPeriods = [
      period(2024, 0),
      period(2025, 1, { epsDiluted: -1, netIncome: -10 }),
      period(2026, 2),
    ];
    const result = buildHistoricalResearchData(annualPeriods, yearlyPrices(2024, 2026));
    const lossYear = result.financials.find((item) => item.fiscalYear === 2025);
    const latest = result.financials.find((item) => item.fiscalYear === 2026);

    expect(lossYear?.priceEarnings).toBeNull();
    expect(lossYear?.payoutRatio).toBeNull();
    expect(latest?.freeCashFlow).toBeCloseTo(
      (25 - 5) * 1.08 ** 2,
      8,
    );
    expect(latest?.freeCashFlowMargin).toBeTypeOf("number");
    expect(latest?.returnOnEquity).toBeTypeOf("number");
    expect(latest?.referencePrice).toBe(24);
    expect(latest?.provenance?.revenue).toEqual(expect.objectContaining({ source: "fixture" }));
  });

  it("does not invent historical valuation when no nearby price observation exists", () => {
    const result = buildHistoricalResearchData(
      [period(2025, 0), period(2026, 1)],
      [{ date: "2020-01-01", close: 10 }],
    );
    const latest = result.financials.at(-1);

    expect(latest?.referencePrice).toBeNull();
    expect(latest?.priceEarnings).toBeNull();
    expect(latest?.dividendYield).toBeNull();
  });

  it("attaches historical fundamentals and price history to the finished analysis report", () => {
    const annualPeriods = Array.from({ length: 11 }, (_, index) => period(2015 + index, index));
    const input: AnalysisInput = {
      company: { ticker: "FIX", name: "Fixture Corp", country: "US", currency: "USD" },
      market: {
        ticker: "FIX", price: 40, currency: "USD", date: "2026-08-31", volume: 1_000,
        yearHigh: 45, yearLow: 20, provider: "fixture",
        priceHistory: yearlyPrices(2015, 2025), performance: {},
      },
      fundamentals: {
        ticker: "FIX", name: "Fixture Corp", sector: "Technology", industry: "Software",
        annual: [], annualPeriods, reportingCurrency: "USD",
      },
      analysisType: "summary",
      investmentProfile: "balanced",
      analysisDate: "2026-08-31T00:00:00.000Z",
    };

    const report = buildAnalysis(input);
    expect(report.historical?.financials).toHaveLength(10);
    expect(report.historical?.price).toHaveLength(11);
    expect(report.historical?.revenueCagr10y).toBeCloseTo(0.1, 8);
  });
  it("renders historical context through the production ReportView", () => {
    const annualPeriods = Array.from({ length: 4 }, (_, index) => period(2023 + index, index));
    const input: AnalysisInput = {
      company: { ticker: "FIX", name: "Fixture Corp", country: "US", currency: "USD" },
      market: {
        ticker: "FIX", price: 40, currency: "USD", date: "2026-08-31", volume: 1_000,
        yearHigh: 45, yearLow: 20, provider: "fixture",
        priceHistory: yearlyPrices(2023, 2026), performance: {},
      },
      fundamentals: {
        ticker: "FIX", name: "Fixture Corp", sector: "Technology", industry: "Software",
        annual: [], annualPeriods, reportingCurrency: "USD",
      },
      analysisType: "summary",
      investmentProfile: "balanced",
      analysisDate: "2026-08-31T00:00:00.000Z",
    };
    const report = buildAnalysis(input);
    const html = renderToStaticMarkup(createElement(ReportView, { report, mode: "simple", locale: "en" }));
    expect(html).toContain("Historical context");
    expect(html).toContain("Revenue CAGR 3Y");
    expect(html).toContain("Download CSV");
  });

  it("renders the premium cockpit, score drivers and watch signals without fabricating missing data", () => {
    const annualPeriods = Array.from({ length: 4 }, (_, index) => period(2023 + index, index));
    const input: AnalysisInput = {
      company: { ticker: "FIX", name: "Fixture Corp", country: "US", currency: "USD" },
      market: {
        ticker: "FIX", price: 40, currency: "USD", date: "2026-08-31", volume: 1_000,
        yearHigh: 45, yearLow: 20, provider: "fixture",
        priceHistory: yearlyPrices(2023, 2026), performance: {},
      },
      fundamentals: {
        ticker: "FIX", name: "Fixture Corp", sector: "Technology", industry: "Software",
        annual: [], annualPeriods, reportingCurrency: "USD",
      },
      analysisType: "research",
      investmentProfile: "balanced",
      analysisDate: "2026-08-31T00:00:00.000Z",
    };
    const report = buildAnalysis(input);
    const html = renderToStaticMarkup(createElement(ReportView, { report, mode: "pro", locale: "en" }));

    expect(html).toContain("Investment Cockpit");
    expect(html).toContain("Growth dashboard");
    expect(html).toContain("Margin analysis");
    expect(html).toContain("Score Driver Snapshot");
    expect(html).toContain("Peer &amp; Benchmark Lens");
    expect(html).toContain("Benchmark-only view");
    expect(html).toContain("Analyst Expectations");
    expect(html).toContain("Positive contributors");
    expect(html).toContain("What To Watch Next");
    expect(html).toContain("Ask StockBox");
    expect(html).toContain("Missing and unsuitable metrics are not backfilled");
    expect(html).toContain("Latest data timestamp");
    expect(report.market?.price).toBe(40);
    expect(html).toContain("Current share price");
    expect(html).toContain("$40");
  });

  it("renders what-changed comparisons only from a real previous report", () => {
    const previousPeriods = Array.from({ length: 4 }, (_, index) => period(2020 + index, index, {
      revenue: 100 + index * 10,
      operatingIncome: 12 + index * 2,
    }));
    const currentPeriods = Array.from({ length: 4 }, (_, index) => period(2023 + index, index, {
      revenue: 180 + index * 30,
      operatingIncome: 32 + index * 8,
    }));
    const baseInput: AnalysisInput = {
      company: { ticker: "FIX", name: "Fixture Corp", country: "US", currency: "USD" },
      market: {
        ticker: "FIX", price: 40, currency: "USD", date: "2026-08-31", volume: 1_000,
        yearHigh: 45, yearLow: 20, provider: "fixture",
        priceHistory: yearlyPrices(2020, 2026), performance: {},
      },
      fundamentals: {
        ticker: "FIX", name: "Fixture Corp", sector: "Technology", industry: "Software",
        annual: [], annualPeriods: currentPeriods, reportingCurrency: "USD",
      },
      analysisType: "research",
      investmentProfile: "balanced",
      analysisDate: "2026-08-31T00:00:00.000Z",
    };
    const previousReport = buildAnalysis({
      ...baseInput,
      fundamentals: { ...baseInput.fundamentals!, annualPeriods: previousPeriods },
      analysisDate: "2023-08-31T00:00:00.000Z",
    });
    const report = buildAnalysis(baseInput);
    const html = renderToStaticMarkup(createElement(ReportView, { report, previousReport, mode: "pro", locale: "en" }));

    expect(html).toContain("What Changed?");
    expect(html).toContain("Previous analysis");
    expect(html).toContain("Current analysis");
    expect(html).toContain("Improved");
  });

});
