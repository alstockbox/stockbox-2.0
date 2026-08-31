import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoricalResearchView } from "../../src/components/analysis/historical-research";
import { buildHistoricalResearchData } from "../../src/lib/analysis/historical";
import type { AnalysisReport, FinancialPeriod, HistoricalResearchData, HistoricalTtmEpsPoint, MarketDividendEvent, MarketPricePoint } from "../../src/lib/analysis/types";

function annualPeriod(year: number, index: number, overrides: Partial<FinancialPeriod> = {}): FinancialPeriod {
  const scale = 1.1 ** index;
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    currency: "USD",
    revenue: 100 * scale,
    grossProfit: 60 * scale,
    operatingIncome: 20 * scale,
    netIncome: 15 * scale,
    epsDiluted: 2 * scale,
    operatingCashFlow: 30 * scale,
    capitalExpenditures: 5 * scale,
    cashAndEquivalents: 20,
    totalDebt: 30,
    totalEquity: 100,
    totalAssets: 180,
    currentAssets: 70,
    currentLiabilities: 35,
    interestExpense: 3,
    pretaxIncome: 18 * scale,
    incomeTaxExpense: 3 * scale,
    sharesDiluted: 100,
    dividendsPaid: -(5 * 1.06 ** index),
    ...overrides,
  };
}

function valuationFixtures() {
  const eps: HistoricalTtmEpsPoint[] = [];
  const prices: MarketPricePoint[] = [];
  const dividends: MarketDividendEvent[] = [];
  const quarters = ["03-31", "06-30", "09-30", "12-31"];
  for (let year = 2024; year <= 2026; year += 1) {
    for (const suffix of quarters) {
      const date = `${year}-${suffix}`;
      if (date > "2026-06-30") continue;
      eps.push({
        periodEndDate: date,
        epsDiluted: 4,
        currency: "USD",
        basis: "TTM_FROM_QUARTERS",
        provenance: { source: "fixture", valueKind: "derived", periodEnd: date },
      });
      prices.push({ date, close: 20 });
      dividends.push({ date, amount: 0.25, currency: "USD", provider: "fixture" });
    }
  }
  prices.push({ date: "2026-08-31", close: 18 });
  return { eps, prices, dividends };
}

function withFutureFields(historical: HistoricalResearchData) {
  return historical as HistoricalResearchData & {
    freeCashFlowGrowth1y?: number | null;
    freeCashFlowCagr3y?: number | null;
    freeCashFlowCagr5y?: number | null;
    freeCashFlowCagr10y?: number | null;
    valuationContext?: HistoricalResearchData["valuationContext"] & {
      oneYear?: {
        sufficientHistory: boolean;
        priceEarningsMedian: number | null;
        dividendYieldAverage: number | null;
      };
    };
  };
}

describe("Simple Mode historical master table P0", () => {
  it("derives FCF growth and multi-period CAGR in the analysis layer", () => {
    const periods = Array.from({ length: 11 }, (_, index) => annualPeriod(2016 + index, index));
    const historical = withFutureFields(buildHistoricalResearchData(periods));

    expect(historical.freeCashFlowGrowth1y).toBeCloseTo(0.1, 8);
    expect(historical.freeCashFlowCagr3y).toBeCloseTo(0.1, 8);
    expect(historical.freeCashFlowCagr5y).toBeCloseTo(0.1, 8);
    expect(historical.freeCashFlowCagr10y).toBeCloseTo(0.1, 8);
  });

  it("keeps FCF CAGR unavailable when either endpoint is non-positive", () => {
    const periods = [
      annualPeriod(2023, 0, { operatingCashFlow: 2, capitalExpenditures: 5 }),
      annualPeriod(2024, 1),
      annualPeriod(2025, 2),
      annualPeriod(2026, 3),
    ];
    const historical = withFutureFields(buildHistoricalResearchData(periods));

    expect(historical.freeCashFlowCagr3y).toBeNull();
  });

  it("provides a real 1Y historical valuation window alongside 3Y, 5Y, 10Y and MAX", () => {
    const fixtures = valuationFixtures();
    const historical = withFutureFields(buildHistoricalResearchData(
      Array.from({ length: 3 }, (_, index) => annualPeriod(2024 + index, index)),
      fixtures.prices,
      { ttmEpsHistory: fixtures.eps, dividendEvents: fixtures.dividends, currentPriceEarnings: 4.5 },
    ));

    expect(historical.valuationContext?.oneYear).toBeDefined();
    expect(historical.valuationContext?.oneYear?.sufficientHistory).toBe(true);
    expect(historical.valuationContext?.oneYear?.priceEarningsMedian).toBeCloseTo(5, 8);
    expect(historical.valuationContext?.oneYear?.dividendYieldAverage).toBeTypeOf("number");
  });

  it("renders one compact Simple Mode table with current, 1Y, 3Y, 5Y, 10Y and MAX context", () => {
    const fixtures = valuationFixtures();
    const historical = withFutureFields(buildHistoricalResearchData(
      Array.from({ length: 11 }, (_, index) => annualPeriod(2016 + index, index)),
      fixtures.prices,
      { ttmEpsHistory: fixtures.eps, dividendEvents: fixtures.dividends, currentPriceEarnings: 4.5 },
    ));
    const report = {
      ticker: "MASTER",
      companyName: "Master Fixture",
      investmentProfile: "balanced",
      reportingCurrency: "USD",
      historical,
    } as AnalysisReport;

    const html = renderToStaticMarkup(createElement(HistoricalResearchView, { report, mode: "simple", locale: "en" }));

    expect(html).toContain("Historical snapshot");
    expect(html).toContain(">Current<");
    expect(html).toContain(">1Y<");
    expect(html).toContain(">3Y<");
    expect(html).toContain(">5Y<");
    expect(html).toContain(">10Y<");
    expect(html).toContain(">MAX<");
    expect(html).toContain(">P/E<");
    expect(html).toContain("Dividend yield");
    expect(html).toContain("Dividend growth");
    expect(html).toContain(">Revenue<");
    expect(html).toContain(">EPS<");
    expect(html).toContain(">FCF<");
  });

  it("does not relabel insufficient 10Y valuation history as a valid 10Y observation", () => {
    const fixtures = valuationFixtures();
    const historical = withFutureFields(buildHistoricalResearchData(
      Array.from({ length: 3 }, (_, index) => annualPeriod(2024 + index, index)),
      fixtures.prices,
      { ttmEpsHistory: fixtures.eps, dividendEvents: fixtures.dividends, currentPriceEarnings: 4.5 },
    ));
    const report = { ticker: "SHORT", companyName: "Short Fixture", investmentProfile: "balanced", reportingCurrency: "USD", historical } as AnalysisReport;
    const html = renderToStaticMarkup(createElement(HistoricalResearchView, { report, mode: "simple", locale: "en" }));

    expect(html).toContain("Insufficient history");
    expect(html).toContain("MAX");
  });
});
