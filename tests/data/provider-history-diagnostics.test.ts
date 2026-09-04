import { describe, expect, it } from "vitest";
import type { CompanyFundamentals, MarketSnapshot } from "../../src/lib/analysis/types";
import { annualHistoryProviderLimitDiagnostic } from "../../src/lib/data/provider-history-diagnostics";

function fundamentals(years: number): CompanyFundamentals {
  return {
    ticker: "TEST",
    name: "Test Company",
    annualPeriods: Array.from({ length: years }, (_, index) => ({
      fiscalYear: 2026 - (years - 1 - index),
      periodEndDate: `${2026 - (years - 1 - index)}-12-31`,
      revenue: 100 + index,
    })),
  } as CompanyFundamentals;
}

function market(first: string, last: string): MarketSnapshot {
  return {
    ticker: "TEST",
    price: 100,
    currency: "USD",
    date: last,
    performance: {},
    priceHistory: [
      { date: first, close: 50 },
      { date: last, close: 100 },
    ],
  } as MarketSnapshot;
}

describe("annual history provider-limit diagnostic", () => {
  it("flags an old Yahoo-only listing when Yahoo exposes only four annual periods", () => {
    const diagnostic = annualHistoryProviderLimitDiagnostic({
      fundamentals: fundamentals(4),
      market: market("2016-01-04", "2026-09-04"),
      selectedFundamentalsProvider: "Yahoo Finance fundamentals",
    });

    expect(diagnostic).toMatchObject({
      provider: "Yahoo Finance fundamentals",
      capability: "fundamentals",
      status: "partial",
      reason: "annual_history_provider_limit",
    });
  });

  it("does not blame the provider when the listing itself is younger than five years", () => {
    const diagnostic = annualHistoryProviderLimitDiagnostic({
      fundamentals: fundamentals(4),
      market: market("2023-01-03", "2026-09-04"),
      selectedFundamentalsProvider: "Yahoo Finance fundamentals",
    });

    expect(diagnostic).toBeNull();
  });

  it("does not attach the Yahoo cap when another fundamentals resolver was selected", () => {
    const diagnostic = annualHistoryProviderLimitDiagnostic({
      fundamentals: fundamentals(4),
      market: market("2016-01-04", "2026-09-04"),
      selectedFundamentalsProvider: "StockBox fundamentals resolver",
    });

    expect(diagnostic).toBeNull();
  });

  it("does not attach the cap when more than four annual periods are already available", () => {
    const diagnostic = annualHistoryProviderLimitDiagnostic({
      fundamentals: fundamentals(6),
      market: market("2016-01-04", "2026-09-04"),
      selectedFundamentalsProvider: "Yahoo Finance fundamentals",
    });

    expect(diagnostic).toBeNull();
  });
});
