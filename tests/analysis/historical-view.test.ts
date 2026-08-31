import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoricalResearchView } from "../../src/components/analysis/historical-research";
import type { AnalysisReport, HistoricalFinancialPoint } from "../../src/lib/analysis/types";

function point(year: number, overrides: Partial<HistoricalFinancialPoint> = {}): HistoricalFinancialPoint {
  return {
    fiscalYear: year, periodEndDate: `${year}-12-31`, currency: "USD",
    revenue: 100, revenueGrowth: 0.1, eps: 2, epsGrowth: 0.08,
    netIncome: 20, freeCashFlow: 18, freeCashFlowPerShare: 1.8, freeCashFlowMargin: 0.18,
    grossMargin: 0.6, operatingMargin: 0.2, netMargin: 0.15,
    returnOnEquity: 0.16, returnOnAssets: 0.08, returnOnInvestedCapital: 0.13,
    cash: 30, totalDebt: 40, netDebt: 10, debtToEquity: 0.3, currentRatio: 1.5,
    interestCoverage: 8, sharesOutstanding: 10, shareGrowth: 0.01,
    dividendsPaid: 5, dividendPerShare: 0.5, dividendGrowth: 0.05,
    payoutRatio: 0.25, freeCashFlowPayoutRatio: 0.28,
    referencePrice: 25, priceEarnings: 12.5, dividendYield: 0.02,
    ...overrides,
  };
}
function report(profile: AnalysisReport["investmentProfile"]): AnalysisReport {
  const financials = [
    point(2024),
    point(2025, { eps: -1, priceEarnings: null, payoutRatio: null }),
    point(2026, { dividendPerShare: 0.55, dividendYield: 0.022 }),
  ];
  return {
    investmentProfile: profile,
    reportingCurrency: "USD",
    historical: {
      financials,
      price: [
        { date: "2024-12-31", close: 20 },
        { date: "2025-12-31", close: 22 },
        { date: "2026-08-31", close: 25 },
      ],
      revenueCagr3y: 0.1, revenueCagr5y: 0.09, revenueCagr10y: 0.08,
      epsCagr3y: 0.08, epsCagr5y: 0.07, epsCagr10y: 0.06,
      dividendCagr3y: 0.05, dividendCagr5y: 0.04, dividendCagr10y: 0.03,
      dividendYearsIncreased: 8, dividendYearsUnchanged: 1, dividendYearsCut: 1,
    },
  } as AnalysisReport;
}

describe("historical research view", () => {
  it("keeps Simple mode focused on compact historical context", () => {
    const html = renderToStaticMarkup(createElement(HistoricalResearchView, {
      report: report("balanced"), mode: "simple", locale: "en",
    }));
    expect(html).toContain("Historical context");
    expect(html).toContain("Revenue CAGR 10Y");
    expect(html).not.toContain("Balance sheet history");
    expect(html).not.toContain("Historical P/E");
  });
  it("shows full historical tables and non-meaningful valuation states in Pro", () => {
    const html = renderToStaticMarkup(createElement(HistoricalResearchView, {
      report: report("balanced"), mode: "pro", locale: "en",
    }));
    expect(html).toContain("Growth &amp; profitability history");
    expect(html).toContain("Balance sheet history");
    expect(html).toContain("Historical P/E");
    expect(html).toContain("Not meaningful");
  });

  it("gives the dividend profile a dedicated historical snapshot", () => {
    const html = renderToStaticMarkup(createElement(HistoricalResearchView, {
      report: report("dividend"), mode: "pro", locale: "en",
    }));
    expect(html).toContain("Dividend snapshot");
    expect(html).toContain("Dividend CAGR 10Y");
    expect(html).toContain("Years increased");
    expect(html).toContain("FCF payout");
  });
});
