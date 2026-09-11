import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeOperatingCompany: vi.fn(),
  fetchConfiguredMarketData: vi.fn(),
  fetchOfficialInvestmentCompanyNav: vi.fn(),
  fetchOfficialInvestmentCompanyHoldings: vi.fn(),
  fetchYahooLongHistory: vi.fn(),
  fetchYahooEtfHoldingFundamentals: vi.fn(),
  searchCompanies: vi.fn(),
}));

vi.mock("@/lib/data/enhanced-provider", () => ({
  analyzeCompany: mocks.analyzeOperatingCompany,
  fetchConfiguredMarketData: mocks.fetchConfiguredMarketData,
  searchCompanies: mocks.searchCompanies,
}));

vi.mock("@/lib/data/official-investment-company-nav", () => ({
  fetchOfficialInvestmentCompanyNav: mocks.fetchOfficialInvestmentCompanyNav,
}));

vi.mock("@/lib/data/official-investment-company-holdings", () => ({
  fetchOfficialInvestmentCompanyHoldings: mocks.fetchOfficialInvestmentCompanyHoldings,
}));

vi.mock("@/lib/data/yahoo-long-history", () => ({
  fetchYahooLongHistory: mocks.fetchYahooLongHistory,
}));

vi.mock("@/lib/data/yahoo-etf-holding-fundamentals", () => ({
  fetchYahooEtfHoldingFundamentals: mocks.fetchYahooEtfHoldingFundamentals,
}));

import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-06T20:30:00.000Z";
const company = {
  ticker: "INDU-C.ST",
  name: "AB Industrivärden",
  securityType: "Common Stock" as const,
};

const reported = [0.33, 0.29, 0.15, 0.10, 0.04, 0.04, 0.04, 0.02];
const names = ["Sandvik", "Volvo", "Handelsbanken", "Essity", "Ericsson", "SCA", "Skanska", "Alleima"];
const rawWeightSum = reported.reduce((sum, weight) => sum + weight, 0);

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "industrivarden-quality-fixture",
    ticker: company.ticker,
    companyName: company.name,
    analysisType: "summary",
    investmentProfile: "balanced",
    generatedAt: observedAt,
    oneSentence: "fixture",
    summary: "fixture",
    recommendation: "No Rating",
    shortTermAssessment: "fixture",
    longTermAssessment: "fixture",
    metrics: {
      revenueGrowth1y: null,
      revenueCagr3y: null,
      epsGrowth1y: null,
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      fcf: null,
      fcfMargin: null,
      cashConversion: null,
      debtToEquity: null,
      debtToAssets: null,
      netDebt: null,
      interestCoverage: null,
      earningsYield: null,
      fcfYield: null,
      priceMomentum1y: null,
      priceMomentum3m: null,
    },
    score: {
      score: null,
      personalizedScore: null,
      confidence: 60,
      dimensions: [],
      missingData: [],
    },
    dcf: { suitable: false, reason: "fixture", bear: null, base: null, bull: null },
    redFlags: [],
    greenFlags: [],
    scenarios: [],
    sources: [],
    disclaimer: "fixture",
    modelVersion: "fixture",
    reportSchemaVersion: "fixture",
    dataCoverage: 0,
    dataStatus: "current",
    providerDiagnostics: [],
    analysisArchetype: "holding_company",
    market: {
      ticker: company.ticker,
      price: 420,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 182_000_000_000,
      sharesOutstanding: 432_000_000,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
    engine: {
      metrics: {
        latestPeriod: {
          fiscalYear: 2025,
          periodEndDate: "2025-12-31",
          cashAndEquivalents: 2_000_000_000,
          totalDebt: 8_000_000_000,
        },
      },
    } as UniversalSecurityReport["engine"],
  };
}

function officialNavSuccess() {
  return {
    ok: true as const,
    data: {
      reportedNav: 190_000_000_000,
      reportedNavPerShare: 440,
      navAsOf: "2026-06-30",
      navPerShareHistory: [],
      source: {
        name: "Industrivärden official NAV",
        url: "https://example.com/industrivarden-nav",
        accessedAt: observedAt,
        freshness: "official fixture",
        provider: "official-investment-company-nav",
        capability: "specialized" as const,
        dataAsOf: "2026-06-30",
        version: "official-investment-company-nav-v3",
      },
      diagnostic: {
        provider: "Official investment-company NAV",
        capability: "specialized" as const,
        status: "available" as const,
        observedAt,
      },
    },
  };
}

function officialHoldingsSuccess() {
  return {
    ok: true as const,
    data: {
      holdings: names.map((name, index) => ({
        name,
        reportedWeight: reported[index],
        weight: reported[index] / rawWeightSum,
      })),
      rawWeightSum,
      asOf: "2026-06-30",
      source: {
        name: "Industrivärden official portfolio",
        url: "https://www.industrivarden.se/en-gb/operations/portfolio/ownership-and-development/",
        accessedAt: observedAt,
        freshness: "official fixture",
        provider: "official-investment-company-holdings",
        capability: "specialized" as const,
        dataAsOf: "2026-06-30",
        version: "v1",
      },
      diagnostic: {
        provider: "Official investment-company holdings",
        capability: "specialized" as const,
        status: "available" as const,
        observedAt,
      },
    },
  };
}

function unavailableLongHistory() {
  return {
    ok: false as const,
    reason: "fixture_unavailable",
    diagnostic: {
      provider: "Yahoo Finance long history",
      capability: "market_data" as const,
      status: "unavailable" as const,
      reason: "fixture_unavailable",
      observedAt,
    },
  };
}

const issuers: Record<string, CompanySearchResult> = {
  Sandvik: { ticker: "SAND.ST", canonicalTicker: "SAND.ST", name: "Sandvik AB (publ)", securityType: "Common Stock", issuerId: "issuer:sandvik" },
  Volvo: { ticker: "VOLV-B.ST", canonicalTicker: "VOLV-B.ST", name: "AB Volvo (publ)", securityType: "Common Stock", issuerId: "issuer:volvo" },
  Handelsbanken: { ticker: "SHB-A.ST", canonicalTicker: "SHB-A.ST", name: "Svenska Handelsbanken AB (publ)", securityType: "Common Stock", issuerId: "issuer:handelsbanken" },
  Essity: { ticker: "ESSITY-B.ST", canonicalTicker: "ESSITY-B.ST", name: "Essity AB (publ)", securityType: "Common Stock", issuerId: "issuer:essity" },
};

function qualitySuccess(ticker: string) {
  return {
    ok: true as const,
    data: {
      revenueGrowth: 0.08,
      epsGrowth: 0.10,
      operatingMargin: 0.16,
      sector: "Industrials",
      country: "Sweden",
    },
    source: {
      name: "Yahoo Finance holding fundamentals",
      url: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`,
      accessedAt: observedAt,
      freshness: "Latest quoteSummary snapshot",
      provider: "Yahoo Finance",
      capability: "specialized" as const,
      version: "yahoo-etf-holding-fundamentals-v2",
    },
    diagnostic: {
      provider: "Yahoo Finance ETF holding fundamentals",
      capability: "specialized" as const,
      status: "available" as const,
      observedAt,
    },
  };
}

describe("investment-company holding-quality production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.analyzeOperatingCompany.mockResolvedValue({ ok: true, data: coreHoldingCompanyReport(), sources: [], warnings: [] });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(officialNavSuccess());
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(officialHoldingsSuccess());
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
    mocks.searchCompanies.mockImplementation(async (query: string) => issuers[query] ? [issuers[query]] : []);
    mocks.fetchYahooEtfHoldingFundamentals.mockImplementation(async (holding: { ticker?: string }) => qualitySuccess(holding.ticker ?? "UNKNOWN"));
  });

  it("resolves and enriches largest official holdings only until verified quality weight reaches 80%", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const quality = analysis?.score.factors.find((factor) => factor.key === "holdings_quality");

    expect(mocks.searchCompanies.mock.calls.map(([query]) => query)).toEqual([
      "Sandvik",
      "Volvo",
      "Handelsbanken",
      "Essity",
    ]);
    expect(mocks.fetchYahooEtfHoldingFundamentals).toHaveBeenCalledTimes(4);
    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.map(([holding]) => holding.ticker)).toEqual([
      "SAND.ST",
      "VOLV-B.ST",
      "SHB-A.ST",
      "ESSITY-B.ST",
    ]);
    expect(analysis?.lookThrough.qualityCoveredWeight).toBeGreaterThanOrEqual(0.80);
    expect(analysis?.lookThrough.stockBoxQuality).not.toBeNull();
    expect(quality?.status).toBe("available");
    expect(report.sources.some((source) => source.provider === "Yahoo Finance" && source.capability === "specialized")).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });

  it("keeps holdings quality missing when issuer resolution cannot reach 80% of total official portfolio weight", async () => {
    mocks.searchCompanies.mockResolvedValue([]);

    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const quality = analysis?.score.factors.find((factor) => factor.key === "holdings_quality");

    expect(mocks.searchCompanies).toHaveBeenCalledTimes(8);
    expect(mocks.fetchYahooEtfHoldingFundamentals).not.toHaveBeenCalled();
    expect(analysis?.lookThrough.qualityCoveredWeight).toBe(0);
    expect(analysis?.lookThrough.stockBoxQuality).toBeNull();
    expect(quality?.status).toBe("missing");
    expect(report.sources.some((source) => source.provider === "Yahoo Finance" && source.capability === "specialized")).toBe(false);
    expect(report.recommendation).toBe("No Rating");
  });
});