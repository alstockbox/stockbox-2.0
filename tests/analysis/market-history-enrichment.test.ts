import { describe, expect, it } from "vitest";
import type { AnalysisReport, MarketDividendEvent, MarketPricePoint } from "../../src/lib/analysis/types";
import { applyVerifiedMarketHistoryEnrichment } from "../../src/lib/analysis/market-history-enrichment";

type CurrencyPoint = MarketPricePoint & { currency?: string | null; provider?: string };

function baseReport(): AnalysisReport {
  const price = [2022, 2023, 2024, 2025, 2026].map((year) => ({ date: `${year}-08-31`, close: 200 + (year - 2022) * 20, currency: "SEK" })) as CurrencyPoint[];
  return {
    ticker: "BOX.ST",
    companyName: "Box AB",
    generatedAt: "2026-09-01T08:00:00.000Z",
    reportingCurrency: "SEK",
    market: { ticker: "BOX.ST", price: 280, currency: "SEK", date: "2026-08-31", volume: 100, yearHigh: 300, yearLow: 180, performance: {}, priceHistory: price, priceHistoryBasis: "close" },
    historical: {
      financials: [], price,
      coverage: {
        methodVersion: "historical-coverage-v1",
        financials: { requestedYears: 10, availableYears: 4, observationCount: 4, status: "partial" },
        price: { requestedYears: 10, availableYears: 4, observationCount: 5, status: "partial" },
        valuation: { requestedYears: 10, availableYears: 0, observationCount: 0, status: "unavailable" },
        dividend: { requestedYears: 10, availableYears: 4, observationCount: 4, status: "partial", eventCoverageYears: 0 },
      },
      revenueCagr3y: null, revenueCagr5y: null, revenueCagr10y: null,
      epsCagr3y: null, epsCagr5y: null, epsCagr10y: null,
      dividendCagr3y: null, dividendCagr5y: null, dividendCagr10y: null,
      dividendYearsIncreased: 0, dividendYearsUnchanged: 0, dividendYearsCut: 0,
    },
  } as unknown as AnalysisReport;
}

function longPrice(currency = "SEK"): CurrencyPoint[] {
  const out: CurrencyPoint[] = [];
  for (let year = 2014; year <= 2026; year += 1) for (let month = 1; month <= (year === 2026 ? 8 : 12); month += 1) out.push({ date: `${year}-${String(month).padStart(2, "0")}-28`, close: 100 + year - 2014 + month, currency });
  return out;
}

function dividends(currency = "SEK"): MarketDividendEvent[] {
  return Array.from({ length: 13 }, (_, index) => ({ date: `${2014 + index}-05-15`, amount: 2 + index * 0.25, currency, provider: "secondary" }));
}

describe("verified market-history enrichment", () => {
  it("backfills verified 10Y+ market and dividend history", () => {
    const report = baseReport();
    const result = applyVerifiedMarketHistoryEnrichment(report, { quoteCurrency: "SEK", priceHistory: longPrice(), dividendEvents: dividends(), provider: "secondary" });
    expect(result.applied).toBe(true);
    expect(report.historical?.coverage?.price.status).toBe("full");
    expect(report.historical?.coverage?.dividend.status).toBe("full");
    expect(report.historical?.dividendCagr10y).not.toBeNull();
    expect((report.historical?.price.at(-1) as CurrencyPoint | undefined)?.currency).toBe("SEK");
  });

  it("rejects a secondary history in another economic currency", () => {
    const report = baseReport();
    const result = applyVerifiedMarketHistoryEnrichment(report, { quoteCurrency: "USD", priceHistory: longPrice("USD"), dividendEvents: dividends("USD"), provider: "secondary" });
    expect(result).toMatchObject({ applied: false, reason: "currency_mismatch" });
    expect(report.historical?.coverage?.price.status).toBe("partial");
  });
});
