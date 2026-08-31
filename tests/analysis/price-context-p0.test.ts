import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoricalResearchView } from "../../src/components/analysis/historical-research";
import { buildHistoricalResearchData } from "../../src/lib/analysis/historical";
import type { AnalysisReport, FinancialPeriod, HistoricalResearchData, MarketPricePoint } from "../../src/lib/analysis/types";

function period(year: number, index: number): FinancialPeriod {
  const scale = 1.05 ** index;
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    currency: "USD",
    revenue: 100 * scale,
    grossProfit: 60 * scale,
    operatingIncome: 20 * scale,
    netIncome: 15 * scale,
    epsDiluted: 2 * scale,
    operatingCashFlow: 25 * scale,
    capitalExpenditures: 5 * scale,
    cashAndEquivalents: 30,
    totalDebt: 20,
    totalEquity: 100,
    totalAssets: 170,
    currentAssets: 70,
    currentLiabilities: 35,
    interestExpense: 2,
    pretaxIncome: 18 * scale,
    incomeTaxExpense: 3 * scale,
    sharesDiluted: 100,
  };
}

function monthlyPrices(startYear: number, endYear: number): MarketPricePoint[] {
  const out: MarketPricePoint[] = [];
  let index = 0;
  for (let year = startYear; year <= endYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      if (year === endYear && month > 8) break;
      out.push({
        date: `${year}-${String(month).padStart(2, "0")}-28`,
        close: 50 + index,
      });
      index += 1;
    }
  }
  return out;
}

type FuturePriceContext = NonNullable<HistoricalResearchData["priceContext"]>;
function withPriceContext(historical: HistoricalResearchData) {
  return historical as HistoricalResearchData & { priceContext?: FuturePriceContext };
}

describe("historical price context P0", () => {
  it("derives 52W distances from provider high/low without changing the quoted price", () => {
    const historical = withPriceContext(buildHistoricalResearchData(
      Array.from({ length: 6 }, (_, index) => period(2021 + index, index)),
      monthlyPrices(2021, 2026),
      { currentPrice: 90, currentPriceDate: "2026-08-31", yearHigh: 120, yearLow: 60 },
    ));

    expect(historical.priceContext?.currentPrice).toBe(90);
    expect(historical.priceContext?.yearHigh).toBe(120);
    expect(historical.priceContext?.yearLow).toBe(60);
    expect(historical.priceContext?.distanceToYearHigh).toBeCloseTo(-0.25, 8);
    expect(historical.priceContext?.distanceFromYearLow).toBeCloseTo(0.5, 8);
    expect(historical.priceContext?.yearRangeSource).toBe("provider");
  });

  it("builds 3Y and 5Y price ranges while refusing to call six years of data 10Y", () => {
    const historical = withPriceContext(buildHistoricalResearchData(
      Array.from({ length: 6 }, (_, index) => period(2021 + index, index)),
      monthlyPrices(2021, 2026),
      { currentPrice: 120, currentPriceDate: "2026-08-31" },
    ));

    expect(historical.priceContext?.threeYear.sufficientHistory).toBe(true);
    expect(historical.priceContext?.fiveYear.sufficientHistory).toBe(true);
    expect(historical.priceContext?.tenYear.sufficientHistory).toBe(false);
    expect(historical.priceContext?.maximum.sufficientHistory).toBe(true);
    expect(historical.priceContext?.maximum.observationCount).toBeGreaterThan(60);
  });

  it("falls back to the verified 1Y price-history range when provider 52W high/low is missing", () => {
    const prices = monthlyPrices(2024, 2026);
    const historical = withPriceContext(buildHistoricalResearchData(
      Array.from({ length: 3 }, (_, index) => period(2024 + index, index)),
      prices,
      { currentPrice: prices.at(-1)?.close ?? null, currentPriceDate: "2026-08-31" },
    ));

    expect(historical.priceContext?.yearRangeSource).toBe("price_history");
    expect(historical.priceContext?.yearHigh).toBe(historical.priceContext?.oneYear.high);
    expect(historical.priceContext?.yearLow).toBe(historical.priceContext?.oneYear.low);
  });

  it("renders creator-readable price context in Simple Mode", () => {
    const historical = buildHistoricalResearchData(
      Array.from({ length: 6 }, (_, index) => period(2021 + index, index)),
      monthlyPrices(2021, 2026),
      { currentPrice: 90, currentPriceDate: "2026-08-31", yearHigh: 120, yearLow: 60 },
    );
    const report = {
      ticker: "PRICE",
      companyName: "Price Fixture",
      investmentProfile: "balanced",
      reportingCurrency: "USD",
      market: { price: 90, currency: "USD", yearHigh: 120, yearLow: 60 },
      historical,
    } as AnalysisReport;

    const html = renderToStaticMarkup(createElement(HistoricalResearchView, { report, mode: "simple", locale: "en" }));

    expect(html).toContain("Price context");
    expect(html).toContain("52W high");
    expect(html).toContain("52W low");
    expect(html).toContain("3Y range");
    expect(html).toContain("5Y range");
    expect(html).toContain("10Y range");
    expect(html).toContain("MAX range");
    expect(html).toContain("Insufficient history");
  });
});
