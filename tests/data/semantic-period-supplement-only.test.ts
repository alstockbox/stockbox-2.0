import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFundamentals, FinancialPeriod } from "../../src/lib/analysis/types";
import { providerDiagnostic } from "../../src/lib/data/providers";

const mocks = vi.hoisted(() => ({
  getMarketDataProviderChain: vi.fn(),
  sec: vi.fn(),
  yahoo: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getMarketDataProviderChain: mocks.getMarketDataProviderChain,
  getServerEnv: vi.fn(() => ({ MARKET_DATA_PROVIDER: "disabled", MARKET_DATA_FALLBACK_PROVIDERS: [], TWELVE_DATA_API_KEY: "" })),
  isFinancialProviderConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/data/sec", () => ({ fetchCompanyFundamentalsResult: mocks.sec }));
vi.mock("@/lib/data/yahoo-fundamentals", () => ({
  fetchYahooFundamentalsResult: mocks.yahoo,
  yahooSymbolForCompany: (company: { canonicalTicker?: string; ticker: string }) => company.canonicalTicker ?? company.ticker,
}));
vi.mock("@/lib/data/sec-submissions", () => ({ fetchSecSubmissionEvents: vi.fn() }));

import { analyzeCompany } from "../../src/lib/data/provider";

function reported(provider: "sec" | "yahoo-fundamentals", periodEnd: string) {
  return {
    source: provider === "sec" ? "SEC Companyfacts" : "Yahoo Finance fundamentals timeseries",
    provider,
    valueKind: "reported" as const,
    periodEnd,
  };
}

function annual(periodEndDate: string, fiscalYear: number): FinancialPeriod {
  return {
    fiscalYear,
    periodEndDate,
    periodBasis: "FY",
    currency: "USD",
    revenue: 90,
    grossProfit: 55,
    operatingIncome: 25,
    netIncome: 20,
    operatingCashFlow: 30,
    capitalExpenditures: 8,
    cashAndEquivalents: 40,
    totalDebt: 20,
    totalEquity: 70,
    totalAssets: 130,
    currentAssets: 65,
    currentLiabilities: 30,
    interestExpense: 2,
    sharesDiluted: 10,
    provenance: {},
  };
}

function fundamentals(ttm: FinancialPeriod, provider: "sec" | "yahoo-fundamentals"): CompanyFundamentals {
  return {
    ticker: "ZXQY",
    name: "Semantic Period Fixture Corp.",
    cik: provider === "sec" ? "0000123456" : undefined,
    entityId: "sec:0000123456",
    sector: "technology",
    industry: "Software",
    analysisArchetype: "standard",
    annual: [],
    annualPeriods: [annual("2023-12-31", 2023), annual("2024-12-31", 2024), annual("2025-12-31", 2025)],
    trailingTwelveMonths: ttm,
  };
}

describe("semantic cross-provider period supplementation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMarketDataProviderChain.mockReturnValue([]);
  });

  it("supplements missing fields across nearby TTM dates without treating overlapping values as exact-period conflicts", async () => {
    const secTtm: FinancialPeriod = {
      periodEndDate: "2026-07-26",
      periodBasis: "TTM_Q2_6M",
      form: "TTM",
      currency: "USD",
      revenue: 100,
      grossProfit: 60,
      operatingIncome: 30,
      netIncome: 22,
      operatingCashFlow: 35,
      capitalExpenditures: 9,
      cashAndEquivalents: 45,
      totalDebt: null,
      totalEquity: 75,
      totalAssets: 140,
      currentAssets: 70,
      currentLiabilities: 32,
      interestExpense: 2,
      sharesDiluted: 10,
      provenance: {
        revenue: reported("sec", "2026-07-26"),
        totalDebt: reported("sec", "2026-07-26"),
      },
    };
    const yahooTtm: FinancialPeriod = {
      ...secTtm,
      periodEndDate: "2026-07-31",
      periodBasis: "TTM_REPORTED",
      revenue: 140,
      totalDebt: 28,
      provenance: {
        revenue: reported("yahoo-fundamentals", "2026-07-31"),
        totalDebt: reported("yahoo-fundamentals", "2026-07-31"),
      },
    };

    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: fundamentals(secTtm, "sec"),
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: fundamentals(yahooTtm, "yahoo-fundamentals"),
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });

    const result = await analyzeCompany({
      company: {
        ticker: "ZXQY",
        canonicalTicker: "ZXQY",
        name: "Semantic Period Fixture Corp.",
        cik: "0000123456",
        entityId: "sec:0000123456",
        country: "US",
        currency: "USD",
      },
      analysisType: "summary",
      investmentProfile: "balanced",
      analysisDate: "2026-09-04T12:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.engine?.metrics.latestPeriod).toMatchObject({
      periodEndDate: "2026-07-26",
      revenue: 100,
      totalDebt: 28,
    });
    expect(result.data.engine?.dataStatus).not.toBe("unavailable");
    expect(result.data.recommendation).not.toBe("No Rating");
    expect(result.data.providerDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "StockBox fundamentals resolver", reason: "supplemented_missing_metrics" }),
    ]));
    expect(result.data.providerDiagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "StockBox fundamentals resolver", reason: "source_conflict" }),
    ]));
  });
});
