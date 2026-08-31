import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFundamentals } from "../../src/lib/analysis/types";
import { providerDiagnostic } from "../../src/lib/data/providers";

const mocks = vi.hoisted(() => ({
  fetchStooqMarketData: vi.fn(),
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
vi.mock("@/lib/data/stooq", () => ({
  stooqMarketDataProvider: {
    id: "stooq-eod",
    capabilities: {
      supportedCountries: ["US"],
      supportedExchanges: ["NYSE", "Nasdaq"],
      supportsFundamentals: false,
      supportsMarketData: true,
      supportsEstimates: false,
    },
    source: vi.fn(() => ({ name: "Stooq", url: "https://stooq.test", freshness: "EOD" })),
    fetchMarketData: mocks.fetchStooqMarketData,
  },
}));
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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMarketDataProviderChain.mockReturnValue([]);
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

  it("rejects non-common securities before provider calls", async () => {
    const result = await analyzeCompany({
      company: {
        ticker: "NVO",
        canonicalTicker: "NVO",
        name: "Novo Nordisk A/S ADR",
        cik: "0000353278",
        securityType: "ADR",
      },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Live fundamentals are not available for this security.");
    }
    expect(mocks.sec).not.toHaveBeenCalled();
    expect(mocks.yahoo).not.toHaveBeenCalled();
  });

  it("rejects omitted-securityType ADRs before provider calls", async () => {
    const result = await analyzeCompany({
      company: {
        ticker: "NVO",
        canonicalTicker: "NVO",
        name: "Novo Nordisk A/S ADR",
        cik: "0000353278",
      },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Live fundamentals are not available for this security.");
    }
    expect(mocks.sec).not.toHaveBeenCalled();
    expect(mocks.yahoo).not.toHaveBeenCalled();
  });

  it("fails analysis when fundamentals are unavailable even if market data is available", async () => {
    mocks.getMarketDataProviderChain.mockReturnValue(["stooq"]);
    mocks.yahoo.mockResolvedValue({
      ok: false,
      reason: "upstream_error",
      message: "Yahoo fundamentals unavailable.",
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", "upstream_error"),
    });
    mocks.fetchStooqMarketData.mockResolvedValueOnce({
      ok: true,
      data: {
        ticker: "VOLV-B.ST",
        price: 265,
        currency: "SEK",
        date: "2026-08-24",
        volume: 1000,
        yearHigh: 290,
        yearLow: 210,
        provider: "stooq-eod",
        performance: { "3M": 0.04, "1Y": 0.12 },
      },
      diagnostic: providerDiagnostic("Stooq", "market_data", "available"),
    });

    const result = await analyzeCompany({
      company: { ticker: "VOLV-B.ST", canonicalTicker: "VOLV-B.ST", name: "AB Volvo B", country: "SE", currency: "SEK" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Fundamental data is unavailable for this company.");
      expect(result.warnings).toEqual(expect.arrayContaining([
        "Fundamental data is unavailable: Yahoo fundamentals unavailable.",
      ]));
      expect(result.providerDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: "Yahoo Finance fundamentals", capability: "fundamentals", status: "unavailable", reason: "upstream_error" }),
        expect.objectContaining({ provider: "Stooq", capability: "market_data", status: "available" }),
      ]));
    }
    expect(mocks.yahoo).toHaveBeenCalledTimes(2);
    expect(mocks.fetchStooqMarketData).toHaveBeenCalledOnce();
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
    expect(mocks.yahoo).toHaveBeenCalledTimes(1);
  });  it("falls back to Yahoo when SEC succeeds technically but has no usable periods", async () => {
    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "NEE", name: "NextEra Energy, Inc.", cik: "0000753308", annual: [], annualPeriods: [] },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: { ...globalFundamentals, ticker: "NEE", name: "NextEra Energy, Inc." },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });
    const result = await analyzeCompany({
      company: { ticker: "NEE", canonicalTicker: "NEE", name: "NextEra Energy, Inc.", cik: "0000753308", country: "US", currency: "USD" },
      analysisType: "summary", investmentProfile: "balanced",
    });
    expect(result.ok).toBe(true);
    expect(mocks.sec).toHaveBeenCalledTimes(1);
    expect(mocks.yahoo).toHaveBeenCalledTimes(1);
  });

  it("supplements missing SEC metrics from a comparable same-currency Yahoo period without overwriting SEC", async () => {
    const secPeriod = {
      fiscalYear: 2025,
      periodEndDate: "2025-12-31",
      periodBasis: "FY" as const,
      currency: "USD",
      revenue: 100,
      netIncome: null,
      totalDebt: null,
      provenance: {
        revenue: { source: "SEC Companyfacts", provider: "sec", valueKind: "reported" as const, periodEnd: "2025-12-31" },
      },
    };
    const yahooPeriod = {
      ...secPeriod,
      revenue: 100,
      netIncome: 12,
      totalDebt: 30,
      provenance: {
        revenue: { source: "Yahoo Finance fundamentals timeseries", provider: "yahoo-fundamentals", valueKind: "reported" as const, periodEnd: "2025-12-31" },
        netIncome: { source: "Yahoo Finance fundamentals timeseries", provider: "yahoo-fundamentals", valueKind: "reported" as const, periodEnd: "2025-12-31" },
        totalDebt: { source: "Yahoo Finance fundamentals timeseries", provider: "yahoo-fundamentals", valueKind: "reported" as const, periodEnd: "2025-12-31" },
      },
    };
    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: [secPeriod] },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "partial"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", entityId: "sec:0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: [yahooPeriod] },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });

    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", country: "US", currency: "USD" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.metrics.latestPeriod).toMatchObject({ revenue: 100, netIncome: 12, totalDebt: 30 });
      expect(result.data.engine?.metrics.latestPeriod?.provenance).toMatchObject({
        revenue: expect.objectContaining({ provider: "sec" }),
        netIncome: expect.objectContaining({ provider: "yahoo-fundamentals" }),
        totalDebt: expect.objectContaining({ provider: "yahoo-fundamentals" }),
      });
      expect(result.data.providerDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ provider: "StockBox fundamentals resolver", reason: "supplemented_missing_metrics" }),
      ]));
    }
  });

  it("marks a material same-period SEC and Yahoo disagreement as a source conflict and returns No Rating", async () => {
    const period = {
      fiscalYear: 2025,
      periodEndDate: "2025-12-31",
      periodBasis: "FY" as const,
      currency: "USD",
      revenue: 100,
      operatingIncome: 20,
      netIncome: 10,
      operatingCashFlow: 15,
      capitalExpenditures: 5,
      provenance: { revenue: { source: "SEC Companyfacts", provider: "sec", valueKind: "reported" as const, periodEnd: "2025-12-31" } },
    };
    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: [period] },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", entityId: "sec:0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: [{ ...period, revenue: 140, provenance: { revenue: { source: "Yahoo Finance fundamentals timeseries", provider: "yahoo-fundamentals", valueKind: "reported" as const, periodEnd: "2025-12-31" } } }] },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });

    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", country: "US", currency: "USD" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.dataStatus).toBe("unavailable");
      expect(result.data.recommendation).toBe("No Rating");
      expect(result.data.engine?.reconciliation).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "provider_source_conflict", status: "warning" }),
      ]));
    }
  });

  it("reconciles stable reciprocal EPS/share basis differences without confidence penalty", async () => {
    const makePeriod = (year: number, epsDiluted: number, sharesDiluted: number, provider: string) => ({
      fiscalYear: year, periodEndDate: `${year}-12-31`, periodBasis: "FY" as const, currency: "USD",
      revenue: 100, operatingIncome: 20, netIncome: epsDiluted * sharesDiluted,
      dilutedNetIncomeAvailableToCommon: epsDiluted * sharesDiluted, operatingCashFlow: 15, capitalExpenditures: 5,
      epsDiluted, sharesDiluted,
      provenance: {
        epsDiluted: { source: provider, provider, valueKind: "reported" as const, periodEnd: `${year}-12-31` },
        sharesDiluted: { source: provider, provider, valueKind: "reported" as const, periodEnd: `${year}-12-31` },
      },
    });
    const secPeriods = [makePeriod(2024, 2, 100, "sec"), makePeriod(2025, 3, 100, "sec")];
    const yahooPeriods = [makePeriod(2024, 0.5, 400, "yahoo-fundamentals"), makePeriod(2025, 0.75, 400, "yahoo-fundamentals")];
    mocks.sec.mockResolvedValueOnce({ ok: true, data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: secPeriods }, diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available") });
    mocks.yahoo.mockResolvedValueOnce({ ok: true, data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: yahooPeriods }, diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available") });
    const result = await analyzeCompany({ company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", country: "US", currency: "USD" }, analysisType: "summary", investmentProfile: "balanced" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.sourceConflicts.filter((item) => item.metric === "epsDiluted" || item.metric === "sharesDiluted")).toEqual([]);
      expect(result.data.engine?.sourceConflicts).toEqual(expect.arrayContaining([expect.objectContaining({ metric: "shareBasis", resolved: true })]));
      expect(result.data.engine?.confidenceBreakdown.sourceConflict).toBe(100);
      expect(result.data.engine?.metrics.growth.epsGrowthYoY).toBeCloseTo(0.5, 6);
    }
  });
  it("fails closed on EPS growth when reciprocal share basis changes between comparison years", async () => {
    const makePeriod = (year: number, epsDiluted: number, sharesDiluted: number, provider: string) => ({
      fiscalYear: year, periodEndDate: `${year}-12-31`, periodBasis: "FY" as const, currency: "USD",
      revenue: 100, operatingIncome: 20, netIncome: epsDiluted * sharesDiluted,
      dilutedNetIncomeAvailableToCommon: epsDiluted * sharesDiluted, operatingCashFlow: 15, capitalExpenditures: 5,
      epsDiluted, sharesDiluted,
      provenance: {
        epsDiluted: { source: provider, provider, valueKind: "reported" as const, periodEnd: `${year}-12-31` },
        sharesDiluted: { source: provider, provider, valueKind: "reported" as const, periodEnd: `${year}-12-31` },
      },
    });
    const secPeriods = [makePeriod(2024, 8, 100, "sec"), makePeriod(2025, 3, 400, "sec")];
    const yahooPeriods = [makePeriod(2024, 2, 400, "yahoo-fundamentals"), makePeriod(2025, 3, 400, "yahoo-fundamentals")];
    mocks.sec.mockResolvedValueOnce({ ok: true, data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: secPeriods }, diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available") });
    mocks.yahoo.mockResolvedValueOnce({ ok: true, data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: yahooPeriods }, diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available") });
    const result = await analyzeCompany({ company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", country: "US", currency: "USD" }, analysisType: "summary", investmentProfile: "balanced" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.metrics.growth.epsGrowthYoY).toBeNull();
      expect(result.data.engine?.sourceConflicts).toEqual(expect.arrayContaining([expect.objectContaining({ metric: "shareBasis", resolved: true })]));
    }
  });

  it("preserves source conflicts already reported by primary and secondary fundamentals providers", async () => {
    const period = {
      fiscalYear: 2024,
      periodEndDate: "2024-12-31",
      periodBasis: "FY" as const,
      currency: "USD",
      revenue: 100,
      operatingIncome: 20,
      netIncome: 10,
      operatingCashFlow: 15,
      capitalExpenditures: 5,
    };
    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: {
        ticker: "AAPL",
        name: "Apple Inc.",
        cik: "0000320193",
        entityId: "sec:0000320193",
        sector: "technology",
        industry: "Technology Hardware",
        annual: [],
        annualPeriods: [period],
        sourceConflicts: [{
          metric: "totalDebt",
          periodEnd: "2022-12-31",
          primaryProvider: "sec",
          secondaryProvider: "legacy-provider",
          primaryValue: 100,
          secondaryValue: 130,
          relativeDifference: 0.23,
          severity: "high",
          reason: "Historical provider debt values differ materially.",
        }],
      },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: {
        ticker: "AAPL",
        name: "Apple Inc.",
        cik: "0000320193",
        entityId: "sec:0000320193",
        sector: "technology",
        industry: "Technology Hardware",
        annual: [],
        annualPeriods: [period],
        sourceConflicts: [{
          metric: "cashAndEquivalents",
          periodEnd: "2021-12-31",
          primaryProvider: "yahoo-fundamentals",
          secondaryProvider: "legacy-provider",
          primaryValue: 50,
          secondaryValue: 58,
          relativeDifference: 0.14,
          severity: "medium",
          reason: "Historical provider cash values differ within the review band.",
        }],
      },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });

    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", country: "US", currency: "USD" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.sourceConflicts).toEqual(expect.arrayContaining([
        expect.objectContaining({ metric: "totalDebt", primaryProvider: "sec", secondaryProvider: "legacy-provider" }),
        expect.objectContaining({ metric: "cashAndEquivalents", primaryProvider: "yahoo-fundamentals", secondaryProvider: "legacy-provider" }),
      ]));
    }
  });

  it("records an EBITDA comparability limitation instead of a fake high numerical conflict", async () => {
    const secPeriod = {
      fiscalYear: 2025,
      periodEndDate: "2025-12-31",
      periodBasis: "FY" as const,
      currency: "USD",
      revenue: 100,
      operatingIncome: 20,
      ebitda: 24,
      netIncome: 10,
      operatingCashFlow: 15,
      capitalExpenditures: 5,
      provenance: {
        ebitda: { source: "SEC Companyfacts derived EBITDA", provider: "sec", valueKind: "derived" as const, periodEnd: "2025-12-31" },
      },
    };
    const yahooPeriod = {
      ...secPeriod,
      ebitda: 35,
      provenance: {
        ebitda: { source: "Yahoo Finance reported EBITDA", provider: "yahoo-fundamentals", valueKind: "reported" as const, periodEnd: "2025-12-31" },
      },
    };
    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: [secPeriod] },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: [yahooPeriod] },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });

    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", entityId: "sec:0000320193", country: "US", currency: "USD" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.dataStatus).not.toBe("unavailable");
      expect(result.data.engine?.sourceConflicts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          metric: "ebitda",
          relativeDifference: null,
          severity: "medium",
        }),
      ]));
    }
  });

  it("does not merge Yahoo metrics from a different period or reporting currency", async () => {
    const secPeriod = { fiscalYear: 2025, periodEndDate: "2025-12-31", periodBasis: "FY" as const, currency: "USD", revenue: 100, netIncome: null };
    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: [secPeriod] },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "partial"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", sector: "technology", industry: "Technology Hardware", annual: [], annualPeriods: [{ ...secPeriod, periodEndDate: "2024-12-31", currency: "EUR", netIncome: 20 }] },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });

    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", country: "US", currency: "USD" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.metrics.latestPeriod?.periodEndDate).toBe("2025-12-31");
      expect(result.data.engine?.metrics.latestPeriod?.netIncome).toBeNull();
    }
  });

  it("fails safely when neither provider has usable financial periods", async () => {
    mocks.sec.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", cik: "0000320193", annual: [], annualPeriods: [] },
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "partial", "empty_response"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: { ticker: "AAPL", name: "Apple Inc.", annual: [], annualPeriods: [] },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "partial", "empty_response"),
    });

    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", country: "US", currency: "USD" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Fundamental data is unavailable for this company.");
  });

  it("falls back to Yahoo when a CIK-backed SEC request is unavailable", async () => {
    mocks.sec.mockResolvedValue({
      ok: false, reason: "upstream_error", message: "SEC temporarily unavailable",
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "upstream_error"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: { ...globalFundamentals, ticker: "AAPL", name: "Apple Inc." },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });
    const result = await analyzeCompany({
      company: { ticker: "AAPL", canonicalTicker: "AAPL", name: "Apple Inc.", cik: "0000320193", country: "US", currency: "USD" },
      analysisType: "summary", investmentProfile: "balanced",
    });
    expect(result.ok).toBe(true);
    expect(mocks.sec).toHaveBeenCalledTimes(2);
    expect(mocks.yahoo).toHaveBeenCalledTimes(1);
  });

  it("does not propagate stale Yahoo market cap or stale shares as current valuation inputs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    mocks.getMarketDataProviderChain.mockReturnValue(["stooq"]);
    mocks.fetchStooqMarketData.mockResolvedValueOnce({
      ok: true,
      data: {
        ticker: "VOLV-B.ST",
        price: 265,
        currency: "SEK",
        date: "2026-08-25",
        volume: 1_000,
        yearHigh: 290,
        yearLow: 210,
        provider: "stooq-eod",
        performance: {},
      },
      diagnostic: providerDiagnostic("Stooq", "market_data", "available"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: {
        ...globalFundamentals,
        trailingTwelveMonths: {
          ...globalFundamentals.trailingTwelveMonths!,
          currentSharesOutstanding: null,
        },
        reportedMarketCap: 700_000,
        reportedMarketCapDate: "2026-06-01",
        reportedMarketCapCurrency: "SEK",
        reportedSharesOutstanding: 2_033,
        reportedSharesDate: "2025-12-31",
      },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });

    const result = await analyzeCompany({
      company: { ticker: "VOLV-B.ST", canonicalTicker: "VOLV-B.ST", name: "AB Volvo B", country: "SE", currency: "SEK" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.metrics.valuation.marketCap).toBeNull();
      expect(result.data.engine?.missingData).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "marketCap" }),
      ]));
    }
  });

  it("derives current shares from same-currency current market cap and price when reported shares are stale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    mocks.getMarketDataProviderChain.mockReturnValue(["stooq"]);
    mocks.fetchStooqMarketData.mockResolvedValueOnce({
      ok: true,
      data: {
        ticker: "VOLV-B.ST",
        price: 250,
        currency: "SEK",
        date: "2026-08-25",
        volume: 1_000,
        yearHigh: 290,
        yearLow: 210,
        provider: "stooq-eod",
        performance: {},
      },
      diagnostic: providerDiagnostic("Stooq", "market_data", "available"),
    });
    mocks.yahoo.mockResolvedValueOnce({
      ok: true,
      data: {
        ...globalFundamentals,
        trailingTwelveMonths: {
          ...globalFundamentals.trailingTwelveMonths!,
          currentSharesOutstanding: null,
        },
        reportedMarketCap: 500_000,
        reportedMarketCapDate: "2026-08-25",
        reportedMarketCapCurrency: "SEK",
        reportedSharesOutstanding: 2_033,
        reportedSharesDate: "2025-12-31",
      },
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available"),
    });

    const result = await analyzeCompany({
      company: { ticker: "VOLV-B.ST", canonicalTicker: "VOLV-B.ST", name: "AB Volvo B", country: "SE", currency: "SEK" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.diagnostics.sharesOutstandingStatus).toBe("current");
      expect(result.data.engine?.missingData.map((item) => item.field)).not.toContain("shares_outstanding_freshness");
      expect(result.data.engine?.dcf.missingData.map((item) => item.field)).not.toContain("sharesOutstanding");
    }
  });

  it("prefers a usable secondary classification over an unknown primary classification", async () => {
    const period = { ...globalFundamentals.annualPeriods![0], currency: "USD", periodEndDate: "2025-12-31" };
    mocks.sec.mockResolvedValueOnce({ ok: true, data: {
      ticker: "COST", name: "Costco Wholesale Corporation", cik: "0000909832", sector: "other", industry: null,
      analysisArchetype: "unknown", classificationDiagnostics: { reason: "SEC metadata unavailable", source: "fallback", confidence: 0.2, ambiguous: false, candidates: ["unknown"] },
      annual: [], annualPeriods: [period],
    }, diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available") });
    mocks.yahoo.mockResolvedValueOnce({ ok: true, data: {
      ticker: "COST", name: "Costco Wholesale Corporation", entityId: "sec:0000909832", sector: "consumer", industry: "Discount Stores",
      analysisArchetype: "standard", classificationDiagnostics: { reason: "Yahoo sector metadata supplied fallback classification", source: "fallback", confidence: 0.55, ambiguous: false, candidates: ["standard"] },
      annual: [], annualPeriods: [period],
    }, diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "available") });
    const result = await analyzeCompany({ company: { ticker: "COST", canonicalTicker: "COST", name: "Costco Wholesale Corporation", cik: "0000909832", entityId: "sec:0000909832", country: "US", currency: "USD" }, analysisType: "summary", investmentProfile: "balanced" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.engine?.analysisArchetype).toBe("standard");
      expect(result.data.engine?.scores.sector).toBe("consumer");
      expect(result.data.engine?.classificationDiagnostics?.confidence).toBe(0.55);
    }
  });

});
