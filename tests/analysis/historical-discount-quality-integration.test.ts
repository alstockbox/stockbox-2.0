import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoricalResearchView } from "../../src/components/analysis/historical-research";
import { buildAnalysis } from "../../src/lib/analysis/engine";
import type { AnalysisInput, FinancialPeriod, HistoricalTtmEpsPoint, MarketPricePoint } from "../../src/lib/analysis/types";

function annualPeriod(year: number, index: number): FinancialPeriod {
  const revenue = 500 * 1.06 ** index;
  const netIncome = 100 * 1.05 ** index;
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    balanceSheetDate: `${year}-12-31`,
    currency: "USD",
    revenue,
    grossProfit: revenue * 0.6,
    operatingIncome: revenue * 0.22,
    netIncome,
    netIncomeCommonStockholders: netIncome,
    epsDiluted: 2 * 1.05 ** index,
    operatingCashFlow: 125 * 1.05 ** index,
    capitalExpenditures: 20 * 1.04 ** index,
    cashAndEquivalents: 50,
    totalDebt: 60,
    totalEquity: 220,
    totalAssets: 400,
    currentAssets: 140,
    currentLiabilities: 70,
    interestExpense: 5,
    pretaxIncome: netIncome / 0.79,
    incomeTaxExpense: netIncome / 0.79 * 0.21,
    sharesDiluted: 100,
    currentSharesOutstanding: 100,
    dividendsPaid: -30,
  };
}

function quarterlyHistory(): { eps: HistoricalTtmEpsPoint[]; prices: MarketPricePoint[] } {
  const eps: HistoricalTtmEpsPoint[] = [];
  const prices: MarketPricePoint[] = [];
  const quarterEnds = ["03-31", "06-30", "09-30", "12-31"];
  for (let year = 2021; year <= 2026; year += 1) {
    for (const suffix of quarterEnds) {
      const date = `${year}-${suffix}`;
      if (date < "2021-06-30" || date > "2026-06-30") continue;
      eps.push({
        periodEndDate: date,
        epsDiluted: 2,
        currency: "USD",
        basis: "TTM_FROM_QUARTERS",
        provenance: { source: "fixture", valueKind: "derived", periodEnd: date },
      });
      prices.push({ date, close: 40 });
    }
  }
  prices.push({ date: "2026-08-31", close: 15 });
  return { eps, prices };
}

function input(): AnalysisInput {
  const history = quarterlyHistory();
  const annualPeriods = Array.from({ length: 5 }, (_, index) => annualPeriod(2021 + index, index));
  return {
    company: {
      ticker: "DISC",
      name: "Discount Fixture",
      country: "US",
      currency: "USD",
    },
    market: {
      ticker: "DISC",
      price: 15,
      currency: "USD",
      date: "2026-08-31",
      volume: 100_000,
      yearHigh: 25,
      yearLow: 12,
      marketCap: 1_823.259375,
      marketCapAsOf: "2026-08-31",
      marketCapCurrency: "USD",
      sharesOutstanding: 121.550625,
      sharesOutstandingAsOf: "2026-08-31",
      provider: "fixture",
      priceHistory: history.prices,
      performance: {},
    },
    fundamentals: {
      ticker: "DISC",
      name: "Discount Fixture",
      sector: "Technology",
      industry: "Software",
      annual: [],
      annualPeriods,
      historicalTtmEps: history.eps,
      reportingCurrency: "USD",
    },
    analysisType: "summary",
    investmentProfile: "value",
    analysisDate: "2026-08-31T00:00:00.000Z",
  };
}

describe("historical discount quality integration", () => {
  it("attaches the deterministic classification to the finished report", () => {
    const report = buildAnalysis(input());
    const quality = (report.historical as unknown as { discountQuality?: { classification?: string; methodVersion?: string } } | undefined)?.discountQuality;

    expect(report.historical?.valuationContext?.referenceWindow).toBe("5Y");
    expect(report.historical?.valuationContext?.currentPeVsReferenceMedian).toBeLessThan(0);
    expect(quality?.methodVersion).toBe("historical-discount-quality-v1");
    expect(quality?.classification).toBe("STRONG");
  });

  it("shows the classification and evidence framing in the historical research UI", () => {
    const report = buildAnalysis(input());
    const html = renderToStaticMarkup(createElement(HistoricalResearchView, {
      report,
      mode: "simple",
      locale: "en",
    }));

    expect(html).toContain("Historical Discount Quality");
    expect(html).toContain("STRONG");
    expect(html).toContain("Discount vs historical median");
    expect(html).toContain("Evidence coverage");
  });
});
