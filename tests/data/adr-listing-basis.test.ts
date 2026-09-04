import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFundamentals, CompanySearchResult } from "../../src/lib/analysis/types";
import { providerDiagnostic } from "../../src/lib/data/providers";

const mocks = vi.hoisted(() => ({
  getMarketDataProviderChain: vi.fn(),
  market: vi.fn(),
  sec: vi.fn(),
  yahoo: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getMarketDataProviderChain: mocks.getMarketDataProviderChain,
  getServerEnv: vi.fn(() => ({
    MARKET_DATA_PROVIDER: "stooq",
    MARKET_DATA_FALLBACK_PROVIDERS: [],
    TWELVE_DATA_API_KEY: "",
  })),
  isFinancialProviderConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/data/sec", () => ({ fetchCompanyFundamentalsResult: mocks.sec }));
vi.mock("@/lib/data/sec-submissions", () => ({ fetchSecSubmissionEvents: vi.fn() }));
vi.mock("@/lib/data/yahoo-fundamentals", () => ({
  fetchYahooFundamentalsResult: mocks.yahoo,
  yahooSymbolForCompany: (company: { canonicalTicker?: string; ticker: string }) => company.canonicalTicker ?? company.ticker,
}));
vi.mock("@/lib/data/stooq", () => ({
  stooqMarketDataProvider: {
    id: "stooq-eod",
    capabilities: {
      supportedCountries: ["global"],
      supportedExchanges: ["global"],
      supportsFundamentals: false,
      supportsMarketData: true,
      supportsEstimates: false,
    },
    source: vi.fn(() => ({ name: "Stooq", url: "https://stooq.test", freshness: "EOD" })),
    fetchMarketData: mocks.market,
  },
}));

import { analyzeCompany } from "../../src/lib/data/provider";

const adrCompany: CompanySearchResult = {
  ticker: "EXADR",
  canonicalTicker: "EXADR",
  name: "Example Holdings plc ADR",
  country: "US",
  currency: "USD",
  securityType: "ADR",
  providerCapabilities: {
    fundamentals: true,
    marketData: true,
    providerIds: ["verified-fundamentals-provider", "verified-market-provider"],
  },
};

function fundamentals(overrides: Partial<CompanyFundamentals> = {}): CompanyFundamentals {
  return {
    ticker: "EXADR",
    name: "Example Holdings plc",
    sector: "industrials",
    industry: "Industrial Products",
    analysisArchetype: "standard",
    annual: [],
    annualPeriods: [{
      fiscalYear: 2025,
      periodEndDate: "2025-12-31",
      periodBasis: "FY",
      currency: "DKK",
      revenue: 1_000,
      grossProfit: 400,
      operatingIncome: 180,
      ebitda: 220,
      netIncome: 120,
      netIncomeCommonStockholders: 120,
      epsDiluted: 1.2,
      operatingCashFlow: 170,
      capitalExpenditures: 40,
      cashAndEquivalents: 100,
      totalDebt: 200,
      totalEquity: 500,
      totalAssets: 900,
      totalLiabilities: 400,
      interestExpense: 10,
      pretaxIncome: 150,
      incomeTaxExpense: 30,
      currentSharesOutstanding: 100,
      sharesDiluted: 100,
    }],
    trailingTwelveMonths: {
      periodEndDate: "2026-06-30",
      balanceSheetDate: "2026-06-30",
      periodBasis: "TTM_REPORTED",
      form: "TTM",
      currency: "DKK",
      revenue: 1_100,
      grossProfit: 440,
      operatingIncome: 190,
      ebitda: 230,
      netIncome: 125,
      netIncomeCommonStockholders: 125,
      epsDiluted: 1.25,
      operatingCashFlow: 180,
      capitalExpenditures: 45,
      cashAndEquivalents: 110,
      totalDebt: 190,
      totalEquity: 520,
      totalAssets: 930,
      totalLiabilities: 410,
      interestExpense: 10,
      pretaxIncome: 155,
      incomeTaxExpense: 31,
      currentSharesOutstanding: 100,
      sharesDiluted: 100,
    },
    reportedMarketCap: 1_000,
    reportedMarketCapDate: "2026-09-04",
    reportedMarketCapCurrency: "USD",
    reportedSharesOutstanding: 100,
    reportedSharesDate: "2026-06-30",
    reportedValuation: {
      provider: "Verified listing valuation provider",
      asOfDate: "2026-09-04",
      priceEarnings: 11,
      priceSales: 4,
      priceBook: 5,
      evSales: 4.2,
      evEbitda: 9,
      peg: 2,
      marketCap: 1_000,
      marketCapCurrency: "USD",
      enterpriseValue: 1_100,
      enterpriseValueCurrency: "USD",
      freeCashFlow: 135,
      freeCashFlowCurrency: "DKK",
      freeCashFlowDate: "2026-06-30",
    },
    ...overrides,
  };
}

function market(price: number) {
  return {
    ticker: "EXADR",
    price,
    currency: "USD",
    date: "2026-09-04",
    volume: 10_000,
    yearHigh: 12,
    yearLow: 7,
    marketCap: null,
    sharesOutstanding: null,
    beta: 1,
    provider: "stooq-eod",
    historyLength: 500,
    priceHistory: [],
    performance: { "3M": 0.05, "1Y": 0.12 },
  };
}

describe("ADR listing-basis eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMarketDataProviderChain.mockReturnValue(["stooq"]);
    mocks.sec.mockResolvedValue({
      ok: false,
      reason: "unsupported_symbol",
      message: "No SEC CIK supplied.",
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unsupported", "missing_cik"),
    });
    mocks.yahoo.mockResolvedValue({
      ok: true,
      data: fundamentals(),
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });
  });

  it("fails closed after provider retrieval when ADR listing market cap, price and share basis do not reconcile", async () => {
    mocks.market.mockResolvedValue({
      ok: true,
      data: market(5),
      diagnostic: providerDiagnostic("Stooq", "market_data", "available"),
    });

    const result = await analyzeCompany({
      company: adrCompany,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(mocks.yahoo).toHaveBeenCalled();
    expect(mocks.market).toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.providerDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({
          provider: "StockBox ADR listing basis",
          capability: "fundamentals",
          status: "unsupported",
          reason: "unverified_listing_share_basis",
        }),
      ]));
    }
  });

  it("allows a reconciled ADR through issuer analysis while keeping per-share DCF unavailable on currency mismatch", async () => {
    mocks.market.mockResolvedValue({
      ok: true,
      data: market(10),
      diagnostic: providerDiagnostic("Stooq", "market_data", "available"),
    });

    const result = await analyzeCompany({
      company: adrCompany,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.currencyAlignment.status).toBe("mismatch");
      expect(result.data.engine?.dcf.status).toBe("unavailable");
      expect(result.data.engine?.dcf.reason).toMatch(/currenc/i);
    }
  });
});
