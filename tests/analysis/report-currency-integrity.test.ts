import { describe, expect, it } from "vitest";
import type { AnalysisReport, MarketPricePoint } from "../../src/lib/analysis/types";
import { enforceReportHistoricalCurrencyIntegrity } from "../../src/lib/analysis/report-currency-integrity";

type CurrencyPoint = MarketPricePoint & { currency?: string | null };

function report(currency: string, points: CurrencyPoint[]): AnalysisReport {
  return {
    market: { ticker: "BOX", price: 100, currency, date: "2026-08-31", volume: 1, yearHigh: 120, yearLow: 80, performance: {}, priceHistory: points },
    historical: { financials: [], price: points, revenueCagr3y: null, revenueCagr5y: null, revenueCagr10y: null, epsCagr3y: null, epsCagr5y: null, epsCagr10y: null, dividendCagr3y: null, dividendCagr5y: null, dividendCagr10y: null, dividendYearsIncreased: 0, dividendYearsUnchanged: 0, dividendYearsCut: 0 },
    confidenceBreakdown: { dataCoverage: 100, dataFreshness: 100, sourceQuality: 100, reconciliation: 100, estimateAvailability: 100, valuationInputs: 100, entityIdentity: 100, currencyAlignment: 100, archetypeConfidence: 100, specializedCoverage: null, marketInputFreshness: 100, valuationAssumptions: 100, sourceConflict: 100 },
  } as unknown as AnalysisReport;
}

describe("render-facing currency integrity", () => {
  it("repairs legacy history that lost its quote currency", () => {
    const target = report("SEK", [{ date: "2026-08-31", close: 417.2 }]);
    expect(enforceReportHistoricalCurrencyIntegrity(target)).toBe("repaired");
    expect((target.historical?.price[0] as CurrencyPoint).currency).toBe("SEK");
    expect(target.confidenceBreakdown?.currencyAlignment).toBe(100);
  });

  it("fails closed when explicit history currency conflicts with the listing", () => {
    const target = report("SEK", [{ date: "2026-08-31", close: 417.2, currency: "USD" }]);
    expect(enforceReportHistoricalCurrencyIntegrity(target)).toBe("mismatch");
    expect(target.historical?.price).toHaveLength(0);
    expect(target.confidenceBreakdown?.currencyAlignment).toBe(0);
  });

  it("normalizes pence quotes into a GBP report without changing the economic currency", () => {
    const target = report("GBP", [{ date: "2026-08-31", close: 12300, currency: "GBp" }]);
    expect(enforceReportHistoricalCurrencyIntegrity(target)).toBe("repaired");
    expect(target.historical?.price[0]?.close).toBe(123);
    expect((target.historical?.price[0] as CurrencyPoint).currency).toBe("GBP");
  });
});
