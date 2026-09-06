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

function annualFallbackFxValuation() {
  return {
    asOfDate: "2026-09-03",
    marketCap: 1_000,
    marketCapCurrency: "EUR",
    freeCashFlow: 100,
    freeCashFlowCurrency: "USD",
    freeCashFlowDate: "2025-12-31",
    freeCashFlowPeriodBasis: "FY" as const,
    freeCashFlowYield: 0.086,
    freeCashFlowYieldProvenance: {
      source: "ECB foreign exchange reference rates",
      provider: "ecb",
      valueKind: "derived" as const,
      periodEnd: "2026-09-03",
      inputs: [
        "providerReportedFreeCashFlow:100 USD",
        "providerReportedMarketCap:1000 EUR",
        "ecbRateDate:2026-09-03",
      ],
    },
  };
}

function staleTtmFxValuation() {
  return {
    ...annualFallbackFxValuation(),
    freeCashFlowDate: "2025-09-30",
    freeCashFlowPeriodBasis: "TTM_REPORTED" as const,
  };
}

function reportedTtmProvenance() {
  const metric = {
    source: "Test provider",
    provider: "test",
    valueKind: "reported" as const,
    periodEnd: "2026-06-30",
    periodBasis: "TTM_REPORTED" as const,
  };
  return {
    revenue: metric,
    grossProfit: metric,
    operatingIncome: metric,
    netIncome: metric,
    operatingCashFlow: metric,
    capitalExpenditures: metric,
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

  it("uses an explicit ECB-normalized provider FCF yield without rewriting the raw currencies", () => {
    const result = analyzeFinancials(inputWithMarket({
      marketCap: 1_000,
      marketCapCurrency: "EUR",
      freeCashFlow: 100,
      freeCashFlowCurrency: "USD",
      freeCashFlowDate: "2026-06-30",
      freeCashFlowYield: 0.086,
      freeCashFlowYieldProvenance: {
        source: "ECB foreign exchange reference rates",
        provider: "ecb",
        valueKind: "derived",
        periodEnd: "2026-08-27",
        inputs: [
          "providerReportedFreeCashFlow:USD",
          "providerReportedMarketCap:EUR",
          "ecbRateDate:2026-08-27",
        ],
        note: "Provider free cash flow converted from USD to EUR at the dated ECB reference rate before division by provider market cap.",
      },
    }));

    expect(result.metrics.valuation.freeCashFlowYield).toBeCloseTo(0.086, 8);
    expect(result.metrics.provenance.freeCashFlowYield).toMatchObject({
      source: "ECB foreign exchange reference rates",
      provider: "ecb",
      valueKind: "derived",
      periodEnd: "2026-08-27",
    });
  });

  it("uses the annual financial-flow freshness window only for explicitly FY provider FCF", () => {
    const result = analyzeFinancials({
      ...inputWithMarket(annualFallbackFxValuation()),
      analysisDate: "2026-09-06T00:00:00.000Z",
      trailingTwelveMonths: undefined,
    });

    expect(result.metrics.valuation.freeCashFlowYield).toBeCloseTo(0.086, 8);
  });

  it("keeps the shorter freshness window for TTM provider FCF even after the TTM period object is removed", () => {
    const result = analyzeFinancials({
      ...inputWithMarket(staleTtmFxValuation()),
      analysisDate: "2026-09-06T00:00:00.000Z",
      trailingTwelveMonths: undefined,
    });

    expect(result.metrics.valuation.freeCashFlowYield).toBeNull();
  });

  it("does not infer FY freshness merely because the TTM period object is unavailable", () => {
    const { freeCashFlowPeriodBasis: _basis, ...valuationWithoutBasis } = annualFallbackFxValuation();
    const result = analyzeFinancials({
      ...inputWithMarket(valuationWithoutBasis),
      analysisDate: "2026-09-06T00:00:00.000Z",
      trailingTwelveMonths: undefined,
    });

    expect(result.metrics.valuation.freeCashFlowYield).toBeNull();
  });

  it("keeps the shorter financial-flow freshness window when a valid TTM period exists", () => {
    const result = analyzeFinancials({
      ...inputWithMarket(staleTtmFxValuation()),
      analysisDate: "2026-09-06T00:00:00.000Z",
      trailingTwelveMonths: {
        ...durableCompounderInput.annualPeriods.at(-1)!,
        form: "TTM",
        periodBasis: "TTM_REPORTED",
        periodEndDate: "2026-06-30",
        provenance: reportedTtmProvenance(),
      },
    });

    expect(result.metrics.valuation.freeCashFlowYield).toBeNull();
  });

  it("does not trust a cross-currency precomputed FCF yield without explicit FX provenance", () => {
    const result = analyzeFinancials(inputWithMarket({
      marketCap: 1_000,
      marketCapCurrency: "EUR",
      freeCashFlow: 100,
      freeCashFlowCurrency: "USD",
      freeCashFlowDate: "2026-06-30",
      freeCashFlowYield: 0.086,
    }));
    expect(result.metrics.valuation.freeCashFlowYield).toBeNull();
  });

  it("refuses stale provider valuation ratios", () => {
    const result = analyzeFinancials(inputWithMarket({ asOfDate: "2025-01-01" }));
    expect(result.metrics.valuation.priceEarnings).toBeNull();
    expect(result.metrics.valuation.evEbitda).toBeNull();
    expect(result.scores.dimensions.valuation.score).toBeNull();
  });
});
