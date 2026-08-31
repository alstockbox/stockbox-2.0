import { describe, expect, it } from "vitest";
import {
  buildHistoricalValuationContext,
  buildHistoricalValuationSeries,
  priceOnOrBefore,
  trailingDividendPerShare,
} from "../../src/lib/analysis/historical-valuation";
import type { HistoricalTtmEpsPoint, MarketDividendEvent, MarketPricePoint } from "../../src/lib/analysis/types";

const prices: MarketPricePoint[] = [
  { date: "2024-03-29", close: 90 },
  { date: "2024-06-28", close: 100 },
  { date: "2024-09-30", close: 110 },
  { date: "2024-12-31", close: 120 },
  { date: "2025-03-31", close: 130 },
  { date: "2025-06-30", close: 140 },
  { date: "2025-09-30", close: 150 },
  { date: "2025-12-31", close: 160 },
  { date: "2026-03-31", close: 170 },
  { date: "2026-06-30", close: 180 },
  { date: "2026-08-31", close: 190 },
];

function eps(date: string, value: number): HistoricalTtmEpsPoint {
  return {
    periodEndDate: date,
    epsDiluted: value,
    currency: "USD",
    basis: "TTM_FROM_QUARTERS",
    provenance: {
      source: "fixture quarterly EPS",
      provider: "fixture",
      periodEnd: date,
      periodBasis: "TTM_FROM_QUARTERS",
      valueKind: "derived",
      inputs: ["q1", "q2", "q3", "q4"],
    },
  };
}

const dividends: MarketDividendEvent[] = [
  { date: "2024-05-10", amount: 0.25, currency: "USD", provider: "fixture" },
  { date: "2024-08-10", amount: 0.25, currency: "USD", provider: "fixture" },
  { date: "2024-11-10", amount: 0.25, currency: "USD", provider: "fixture" },
  { date: "2025-02-10", amount: 0.25, currency: "USD", provider: "fixture" },
  { date: "2025-05-10", amount: 0.30, currency: "USD", provider: "fixture" },
  { date: "2025-08-10", amount: 0.30, currency: "USD", provider: "fixture" },
  { date: "2025-11-10", amount: 0.30, currency: "USD", provider: "fixture" },
  { date: "2026-02-10", amount: 0.30, currency: "USD", provider: "fixture" },
  { date: "2026-05-10", amount: 0.35, currency: "USD", provider: "fixture" },
  { date: "2026-08-10", amount: 0.35, currency: "USD", provider: "fixture" },
];

describe("historical valuation P0", () => {
  it("uses only a contemporaneous price on or before the TTM period end", () => {
    expect(priceOnOrBefore("2024-06-30", prices)).toEqual({ date: "2024-06-28", close: 100 });
    expect(priceOnOrBefore("2024-02-01", prices)).toBeNull();
  });

  it("calculates P/E from historical price divided by historical TTM EPS and marks non-positive EPS N/M", () => {
    const series = buildHistoricalValuationSeries({
      prices,
      ttmEps: [eps("2024-06-30", 5), eps("2024-09-30", -1), eps("2024-12-31", 6)],
      dividendEvents: dividends,
    });
    expect(series[0]?.priceEarnings).toBe(20);
    expect(series[0]?.priceEarningsStatus).toBe("available");
    expect(series[1]?.priceEarnings).toBeNull();
    expect(series[1]?.priceEarningsStatus).toBe("not_meaningful");
    expect(series[2]?.priceEarnings).toBe(20);
  });

  it("uses only dividends paid in the trailing year and never future dividends", () => {
    const ttm = trailingDividendPerShare("2025-06-30", dividends);
    expect(ttm.paymentCount).toBe(4);
    expect(ttm.amount).toBeCloseTo(1.05, 8);
    const beforeFirstPayment = trailingDividendPerShare("2024-03-31", dividends);
    expect(beforeFirstPayment).toEqual({ amount: 0, paymentCount: 0 });
  });

  it("keeps missing dividend-event coverage distinct from a verified non-payer", () => {
    expect(trailingDividendPerShare("2026-06-30", undefined)).toEqual({ amount: null, paymentCount: 0 });
    expect(trailingDividendPerShare("2026-06-30", [])).toEqual({ amount: 0, paymentCount: 0 });
  });

  it("calculates historical dividend yield against the same historical price", () => {
    const series = buildHistoricalValuationSeries({
      prices,
      ttmEps: [eps("2025-06-30", 7)],
      dividendEvents: dividends,
    });
    expect(series[0]?.trailingDividendsPerShare).toBeCloseTo(1.05, 8);
    expect(series[0]?.dividendYield).toBeCloseTo(1.05 / 140, 10);
  });

  it("does not label short history as a five- or ten-year window", () => {
    const ttmEps = prices.slice(1, -1).map((point, index) => eps(point.date, 5 + index * 0.1));
    const series = buildHistoricalValuationSeries({ prices, ttmEps, dividendEvents: dividends });
    const context = buildHistoricalValuationContext({
      series,
      currentPriceEarnings: 18,
      prices,
      dividendEvents: dividends,
    });
    expect(context.fiveYear.sufficientHistory).toBe(false);
    expect(context.tenYear.sufficientHistory).toBe(false);
    expect(context.referenceWindow).toBe("MAX");
    expect(context.currentPeVsReferenceMedian).toBeTypeOf("number");
  });

  it("derives current dividend yield from trailing events and the latest contemporaneous price", () => {
    const context = buildHistoricalValuationContext({
      series: buildHistoricalValuationSeries({ prices, ttmEps: [eps("2026-06-30", 8)], dividendEvents: dividends }),
      currentPriceEarnings: 19,
      prices,
      dividendEvents: dividends,
    });
    expect(context.currentTrailingDividendsPerShare).toBeCloseTo(1.3, 8);
    expect(context.currentDividendPaymentCount).toBe(4);
    expect(context.currentDividendYield).toBeCloseTo(1.3 / 190, 10);
  });
});
