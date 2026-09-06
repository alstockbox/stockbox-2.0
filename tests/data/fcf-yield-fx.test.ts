import { describe, expect, it, vi } from "vitest";
import type { ProviderReportedValuation } from "@/lib/analysis/types";
import type { ComparisonFxContext } from "@/lib/data/ecb-fx";
import {
  deriveFxNormalizedProviderFcfYield,
  enrichProviderReportedValuationWithEcbFcfYield,
} from "@/lib/data/fcf-yield-fx";

const baseValuation: ProviderReportedValuation = {
  provider: "Yahoo Finance fundamentals timeseries",
  asOfDate: "2026-08-30",
  marketCap: 1_000,
  marketCapCurrency: "EUR",
  freeCashFlow: 116,
  freeCashFlowCurrency: "USD",
  freeCashFlowDate: "2026-06-30",
};

function context(overrides: Partial<ComparisonFxContext> = {}): ComparisonFxContext {
  return {
    status: "normalized",
    sourceCurrency: "USD",
    targetCurrency: "EUR",
    rateDate: "2026-08-28",
    sourceRatePerEuro: 1.16,
    targetRatePerEuro: 1,
    provider: "ecb-euro-reference-rates",
    methodologyVersion: "ecb-fx-v1",
    ...overrides,
  };
}

describe("provider FCF yield ECB normalization", () => {
  it("converts provider FCF into the explicit provider market-cap currency and preserves raw facts", () => {
    const result = deriveFxNormalizedProviderFcfYield(baseValuation, context());

    expect(result.freeCashFlowYield).toBeCloseTo(0.1, 10);
    expect(result.freeCashFlow).toBe(116);
    expect(result.freeCashFlowCurrency).toBe("USD");
    expect(result.marketCap).toBe(1_000);
    expect(result.marketCapCurrency).toBe("EUR");
    expect(result.freeCashFlowYieldProvenance).toMatchObject({
      source: "ECB foreign exchange reference rates",
      provider: "ecb",
      valueKind: "derived",
      periodEnd: "2026-08-28",
    });
    expect(result.freeCashFlowYieldProvenance?.inputs).toEqual(expect.arrayContaining([
      "providerReportedFreeCashFlow:116 USD",
      "providerReportedMarketCap:1000 EUR",
      "ecbRateDate:2026-08-28",
    ]));
  });

  it("converts non-EUR currency pairs through the dated ECB observation", () => {
    const result = deriveFxNormalizedProviderFcfYield({
      ...baseValuation,
      marketCap: 11_110,
      marketCapCurrency: "SEK",
      freeCashFlow: 1_170,
      freeCashFlowCurrency: "USD",
    }, context({
      targetCurrency: "SEK",
      sourceRatePerEuro: 1.17,
      targetRatePerEuro: 11.11,
    }));

    expect(result.freeCashFlowYield).toBeCloseTo(1, 10);
  });

  it("preserves economically meaningful negative FCF yields", () => {
    const result = deriveFxNormalizedProviderFcfYield({
      ...baseValuation,
      freeCashFlow: -116,
    }, context());

    expect(result.freeCashFlowYield).toBeCloseTo(-0.1, 10);
  });

  it("refuses an ECB observation more than seven days before valuation", () => {
    const result = deriveFxNormalizedProviderFcfYield(baseValuation, context({ rateDate: "2026-08-20" }));
    expect(result.freeCashFlowYield).toBeUndefined();
  });

  it("refuses lookahead FX observations", () => {
    const result = deriveFxNormalizedProviderFcfYield(baseValuation, context({ rateDate: "2026-08-31" }));
    expect(result.freeCashFlowYield).toBeUndefined();
  });

  it("refuses mismatched FX context currencies", () => {
    const result = deriveFxNormalizedProviderFcfYield(baseValuation, context({ sourceCurrency: "GBP" }));
    expect(result.freeCashFlowYield).toBeUndefined();
  });

  it("does not add an FX-derived field when provider facts are already same-currency", () => {
    const sameCurrency = {
      ...baseValuation,
      marketCapCurrency: "USD",
    };
    const result = deriveFxNormalizedProviderFcfYield(sameCurrency, context({ targetCurrency: "USD" }));
    expect(result).toEqual(sameCurrency);
  });

  it("leaves unsupported or unavailable FX contexts untouched", () => {
    const result = deriveFxNormalizedProviderFcfYield(baseValuation, context({
      status: "unavailable",
      rateDate: null,
      sourceRatePerEuro: null,
      targetRatePerEuro: null,
    }));
    expect(result).toEqual(baseValuation);
  });

  it("resolves exactly one dated ECB context only for explicit cross-currency provider valuation", async () => {
    const resolver = vi.fn(async () => new Map([["provider-fcf-yield", context()]]));

    const result = await enrichProviderReportedValuationWithEcbFcfYield(baseValuation, resolver);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith([
      { id: "provider-fcf-yield", currency: "USD", date: "2026-08-30" },
    ], "EUR");
    expect(result.freeCashFlowYield).toBeCloseTo(0.1, 10);
  });

  it("does not resolve ECB context for same-currency provider valuation", async () => {
    const resolver = vi.fn(async () => new Map<string, ComparisonFxContext>());
    const sameCurrency = { ...baseValuation, marketCapCurrency: "USD" };

    const result = await enrichProviderReportedValuationWithEcbFcfYield(sameCurrency, resolver);

    expect(resolver).not.toHaveBeenCalled();
    expect(result).toEqual(sameCurrency);
  });

  it("does not resolve ECB context when required provider facts are missing", async () => {
    const resolver = vi.fn(async () => new Map<string, ComparisonFxContext>());
    const incomplete = { ...baseValuation, marketCap: null };

    const result = await enrichProviderReportedValuationWithEcbFcfYield(incomplete, resolver);

    expect(resolver).not.toHaveBeenCalled();
    expect(result).toEqual(incomplete);
  });
});
