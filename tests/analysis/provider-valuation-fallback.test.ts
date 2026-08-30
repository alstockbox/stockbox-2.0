import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { durableCompounderInput } from "./fixtures";

const reported = {
  provider: "Yahoo Finance fundamentals timeseries",
  asOfDate: "2026-08-27",
  priceEarnings: 10,
  priceSales: 2,
  priceBook: 4,
  evSales: 2.2,
  evEbitda: 8,
  peg: 1.1,
};

function inputWithMarket(overrides: Record<string, unknown> = {}) {
  return {
    ...durableCompounderInput,
    analysisDate: "2026-08-28T00:00:00.000Z",
    company: { ...durableCompounderInput.company, reportingCurrency: "USD", tradingCurrency: "GBP" },
    market: { ...durableCompounderInput.market, currency: "GBP", priceDate: "2026-08-28", marketCapCurrency: "GBP" },
    reportedValuation: { ...reported, ...overrides },
  };
}

describe("provider-reported valuation fallback", () => {
  it("uses fresh provider ratios when cross-currency blocks StockBox-derived valuation", () => {
    const result = analyzeFinancials(inputWithMarket());
    const valuation = result.scores.dimensions.valuation;
    expect(valuation.score).not.toBeNull();
    expect(valuation.coverage).toBeCloseTo(0.65, 5);
    expect((valuation.contributors ?? []).find((item) => item.label === "P/E")).toMatchObject({ value: 10, source: reported.provider, period: reported.asOfDate });
    expect((valuation.contributors ?? []).find((item) => item.label === "EV / EBITDA")?.value).toBe(8);
    expect((valuation.contributors ?? []).find((item) => item.label === "EV / Sales")?.value).toBe(2.2);
    expect((valuation.contributors ?? []).find((item) => item.label === "FCF yield")?.value).toBeNull();
  });
  it("uses provider ratios when share-basis reconciliation blocks local market-cap valuation", () => {
    const result = analyzeFinancials({
      ...durableCompounderInput,
      analysisDate: "2026-08-28T00:00:00.000Z",
      company: { ...durableCompounderInput.company, reportingCurrency: "USD", tradingCurrency: "USD" },
      market: {
        ...durableCompounderInput.market,
        currency: "USD",
        priceDate: "2026-08-28",
        marketCap: 4_000,
        marketCapAsOf: "2026-08-28",
        marketCapCurrency: "USD",
        sharesOutstanding: 10,
        sharesOutstandingAsOf: "2026-08-28",
      },
      reportedValuation: reported,
    });
    expect(result.metrics.valuation.marketCap).toBeNull();
    expect(result.metrics.valuation.priceEarnings).toBe(10);
    expect(result.scores.dimensions.valuation.score).not.toBeNull();
  });

  it("derives provider FCF yield only when provider market cap and FCF currencies align", () => {
    const result = analyzeFinancials(inputWithMarket({
      marketCap: 1_000,
      marketCapCurrency: "USD",
      freeCashFlow: 100,
      freeCashFlowCurrency: "USD",
      freeCashFlowDate: "2026-06-30",
    }));
    expect(result.metrics.valuation.freeCashFlowYield).toBeCloseTo(0.1, 5);
  });
  it("refuses stale provider valuation ratios", () => {
    const result = analyzeFinancials(inputWithMarket({ asOfDate: "2025-01-01" }));
    expect(result.metrics.valuation.priceEarnings).toBeNull();
    expect(result.metrics.valuation.evEbitda).toBeNull();
    expect(result.scores.dimensions.valuation.score).toBeNull();
  });
});
