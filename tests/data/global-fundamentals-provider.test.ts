import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFundamentals } from "../../src/lib/analysis/types";
import { providerDiagnostic } from "../../src/lib/data/providers";

const mocks = vi.hoisted(() => ({
  sec: vi.fn(),
  yahoo: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getMarketDataProviderChain: vi.fn(() => []),
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

const globalFundamentals: CompanyFundamentals = {
  ticker: "VOLV-B.ST",
  name: "AB Volvo (publ)",
  sector: "industrials",
  industry: "Farm & Heavy Construction Machinery",  analysisArchetype: "standard",
  annual: [{
    fiscalYear: 2025,
    periodEndDate: "2025-12-31",
    revenue: 479_183,
    grossProfit: 116_869,
    operatingIncome: 49_476,
    netIncome: 34_456,
    epsDiluted: 16.94,
    operatingCashFlow: 45_595,
    capex: 26_130,
    assets: 648_590,
    liabilities: 470_112,
    cash: 64_761,
    debt: 247_001,
    equity: 178_395,
    interestExpense: 1_832,
  }],
  annualPeriods: [{
    fiscalYear: 2025,
    periodEndDate: "2025-12-31",
    currency: "SEK",
    revenue: 479_183,
    netIncome: 34_456,
    operatingCashFlow: 45_595,
    capitalExpenditures: 26_130,
  }],  trailingTwelveMonths: {
    periodEndDate: "2026-06-30",
    balanceSheetDate: "2026-06-30",
    currency: "SEK",
    revenue: 471_534,
    netIncome: 35_840,
    operatingCashFlow: 49_840,
    capitalExpenditures: 26_551,
    totalAssets: 678_690,
    totalEquity: 176_572,
    currentSharesOutstanding: 2_033,
  },
};

describe("global fundamentals provider orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.yahoo.mockResolvedValue({
      ok: true,
      data: globalFundamentals,
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });
    mocks.sec.mockResolvedValue({
      ok: false,
      reason: "unsupported_symbol",
      message: "A SEC CIK is required for this fundamentals adapter.",
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unsupported", "missing_cik"),
    });
  });  it("uses Yahoo fundamentals for a listed company without a SEC CIK", async () => {
    const result = await analyzeCompany({
      company: { ticker: "VOLV-B.ST", canonicalTicker: "VOLV-B.ST", name: "AB Volvo B", country: "SE", currency: "SEK" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });
    expect(result.ok).toBe(true);
    expect(mocks.yahoo).toHaveBeenCalledTimes(1);
    expect(mocks.sec).not.toHaveBeenCalled();
    if (result.ok) expect(result.data.ticker).toBe("VOLV-B.ST");
  });

  it("keeps SEC primary when a CIK-backed filing source succeeds", async () => {
    mocks.sec.mockResolvedValueOnce({
      ok: true, data: { ...globalFundamentals, ticker: "AAPL", name: "Apple Inc.", cik: "0000320193" },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", country: "US", currency: "USD" },
      analysisType: "summary", investmentProfile: "balanced",
    });
    expect(result.ok).toBe(true);
    expect(mocks.sec).toHaveBeenCalledTimes(1);
    expect(mocks.yahoo).not.toHaveBeenCalled();
  });  it("falls back to Yahoo when SEC succeeds technically but has no usable periods", async () => {
    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "NEE", name: "NextEra Energy, Inc.", cik: "0000753308", annual: [], annualPeriods: [] },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    const result = await analyzeCompany({
      company: { ticker: "NEE", canonicalTicker: "NEE", name: "NextEra Energy, Inc.", cik: "0000753308", country: "US", currency: "USD" },
      analysisType: "summary", investmentProfile: "balanced",
    });
    expect(result.ok).toBe(true);
    expect(mocks.sec).toHaveBeenCalledTimes(1);
    expect(mocks.yahoo).toHaveBeenCalledTimes(1);
  });

  it("falls back to Yahoo when a CIK-backed SEC request is unavailable", async () => {
    mocks.sec.mockResolvedValueOnce({
      ok: false, reason: "upstream_error", message: "SEC temporarily unavailable",
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "upstream_error"),
    });
    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", country: "US", currency: "USD" },
      analysisType: "summary", investmentProfile: "balanced",
    });
    expect(result.ok).toBe(true);
    expect(mocks.sec).toHaveBeenCalledTimes(1);
    expect(mocks.yahoo).toHaveBeenCalledTimes(1);
  });
});