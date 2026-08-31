import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoricalResearchView } from "../../src/components/analysis/historical-research";
import { buildHistoricalResearchData } from "../../src/lib/analysis/historical";
import type { AnalysisReport, FinancialPeriod, HistoricalResearchData, MarketDividendEvent, MarketPricePoint } from "../../src/lib/analysis/types";

type FutureDividendContext = {
  methodVersion: string;
  status: "available" | "partial" | "nonpayer" | "unavailable";
  trailingDividendsPerShare: number | null;
  currentDividendYield: number | null;
  paymentCountTtm: number;
  paymentFrequency: "monthly" | "quarterly" | "semiannual" | "annual" | "irregular" | "none" | "unknown";
  latestPaymentDate: string | null;
  latestPaymentAmount: number | null;
  latestPaymentCurrency: string | null;
  increaseStreakYears: number | null;
  safety: "covered" | "stretched" | "not_covered" | "insufficient";
  annualHistoryYears: number;
  eventCoverageYears: number;
};

function withDividendContext(historical: HistoricalResearchData) {
  return historical as HistoricalResearchData & { dividendContext?: FutureDividendContext };
}

function period(year: number, index: number, overrides: Partial<FinancialPeriod> = {}): FinancialPeriod {
  const scale = 1.05 ** index;
  const dividendPerShare = 1 * 1.05 ** index;
  return {
    fiscalYear: year,
    periodEndDate: `${year}-12-31`,
    currency: "USD",
    revenue: 1_000 * scale,
    grossProfit: 600 * scale,
    operatingIncome: 300 * scale,
    netIncome: 400 * scale,
    epsDiluted: 4 * scale,
    operatingCashFlow: 600 * scale,
    capitalExpenditures: 100 * scale,
    cashAndEquivalents: 300,
    totalDebt: 200,
    totalEquity: 1_000,
    totalAssets: 1_500,
    currentAssets: 700,
    currentLiabilities: 300,
    interestExpense: 20,
    pretaxIncome: 500 * scale,
    incomeTaxExpense: 100 * scale,
    sharesDiluted: 100,
    dividendsPaid: -(dividendPerShare * 100),
    ...overrides,
  };
}

function prices(): MarketPricePoint[] {
  return [
    { date: "2025-08-31", close: 18 },
    { date: "2025-12-31", close: 19 },
    { date: "2026-03-31", close: 20 },
    { date: "2026-06-30", close: 20 },
    { date: "2026-08-31", close: 20 },
  ];
}

const quarterlyEvents: MarketDividendEvent[] = [
  { date: "2024-09-15", amount: 0.20, currency: "USD", provider: "fixture" },
  { date: "2024-12-15", amount: 0.20, currency: "USD", provider: "fixture" },
  { date: "2025-03-15", amount: 0.22, currency: "USD", provider: "fixture" },
  { date: "2025-06-15", amount: 0.22, currency: "USD", provider: "fixture" },
  { date: "2025-09-15", amount: 0.25, currency: "USD", provider: "fixture" },
  { date: "2025-12-15", amount: 0.25, currency: "USD", provider: "fixture" },
  { date: "2026-03-15", amount: 0.25, currency: "USD", provider: "fixture" },
  { date: "2026-06-15", amount: 0.25, currency: "USD", provider: "fixture" },
];

describe("dividend context P0", () => {
  it("normalizes current TTM dividend facts and payment cadence from event data", () => {
    const historical = withDividendContext(buildHistoricalResearchData(
      Array.from({ length: 6 }, (_, index) => period(2021 + index, index)),
      prices(),
      { dividendEvents: quarterlyEvents, currentPrice: 20, currentPriceDate: "2026-08-31" },
    ));

    expect(historical.dividendContext?.methodVersion).toBe("dividend-context-v1");
    expect(historical.dividendContext?.status).toBe("available");
    expect(historical.dividendContext?.trailingDividendsPerShare).toBeCloseTo(1, 8);
    expect(historical.dividendContext?.currentDividendYield).toBeCloseTo(0.05, 8);
    expect(historical.dividendContext?.paymentCountTtm).toBe(4);
    expect(historical.dividendContext?.paymentFrequency).toBe("quarterly");
    expect(historical.dividendContext?.latestPaymentDate).toBe("2026-06-15");
    expect(historical.dividendContext?.latestPaymentAmount).toBe(0.25);
    expect(historical.dividendContext?.latestPaymentCurrency).toBe("USD");
  });

  it("derives a consecutive increase streak and covered payout status without treating missing endpoints as zero", () => {
    const historical = withDividendContext(buildHistoricalResearchData(
      Array.from({ length: 6 }, (_, index) => period(2021 + index, index)),
      prices(),
      { dividendEvents: quarterlyEvents, currentPrice: 20, currentPriceDate: "2026-08-31" },
    ));

    expect(historical.dividendContext?.increaseStreakYears).toBe(5);
    expect(historical.dividendContext?.safety).toBe("covered");
    expect(historical.dividendContext?.annualHistoryYears).toBe(6);
    expect(historical.dividendContext?.eventCoverageYears).toBeGreaterThan(1.5);
  });

  it("does not call dividend safety covered when FCF payout is not meaningful", () => {
    const annual = Array.from({ length: 4 }, (_, index) => period(2023 + index, index));
    annual[annual.length - 1] = period(2026, 3, { operatingCashFlow: 50, capitalExpenditures: 100 });
    const historical = withDividendContext(buildHistoricalResearchData(
      annual,
      prices(),
      { dividendEvents: quarterlyEvents, currentPrice: 20, currentPriceDate: "2026-08-31" },
    ));

    expect(historical.financials.at(-1)?.freeCashFlowPayoutRatio).toBeNull();
    expect(historical.dividendContext?.safety).toBe("insufficient");
  });

  it("keeps payment frequency unknown when annual cash dividends exist but event history is unavailable", () => {
    const historical = withDividendContext(buildHistoricalResearchData(
      Array.from({ length: 4 }, (_, index) => period(2023 + index, index)),
      prices(),
      { currentPrice: 20, currentPriceDate: "2026-08-31" },
    ));

    expect(historical.dividendContext?.status).toBe("partial");
    expect(historical.dividendContext?.paymentFrequency).toBe("unknown");
    expect(historical.dividendContext?.latestPaymentDate).toBeNull();
    expect(historical.dividendContext?.eventCoverageYears).toBe(0);
  });

  it("makes the dividend overview discoverable in Simple Mode for a dividend-paying company regardless of profile", () => {
    const historical = buildHistoricalResearchData(
      Array.from({ length: 6 }, (_, index) => period(2021 + index, index)),
      prices(),
      { dividendEvents: quarterlyEvents, currentPrice: 20, currentPriceDate: "2026-08-31" },
    );
    const report = {
      ticker: "DIV",
      companyName: "Dividend Fixture",
      investmentProfile: "balanced",
      reportingCurrency: "USD",
      market: { price: 20, currency: "USD" },
      historical,
    } as AnalysisReport;

    const html = renderToStaticMarkup(createElement(HistoricalResearchView, { report, mode: "simple", locale: "en" }));

    expect(html).toContain("Dividend snapshot");
    expect(html).toContain("Payment frequency");
    expect(html).toContain("Latest payment");
    expect(html).toContain("Increase streak");
    expect(html).toContain("Dividend safety");
    expect(html).toContain("Coverage");
  });
});
