import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeOperatingCompany: vi.fn(),
  fetchConfiguredMarketData: vi.fn(),
  searchCompanies: vi.fn(),
  fetchOfficialInvestmentCompanyNav: vi.fn(),
  fetchOfficialInvestmentCompanyHoldings: vi.fn(),
  fetchYahooLongHistory: vi.fn(),
  fetchOfficialInvestmentCompanyKeyRatios: vi.fn(),
  fetchOfficialInvestmentCompanyGovernance: vi.fn(),
  fetchYahooEtfHoldingFundamentals: vi.fn(),
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

vi.mock("@/lib/data/official-investment-company-key-ratios", () => ({
  fetchOfficialInvestmentCompanyKeyRatios: mocks.fetchOfficialInvestmentCompanyKeyRatios,
}));

vi.mock("@/lib/data/official-investment-company-governance", () => ({
  fetchOfficialInvestmentCompanyGovernance: mocks.fetchOfficialInvestmentCompanyGovernance,
}));

vi.mock("@/lib/data/yahoo-etf-holding-fundamentals", () => ({
  fetchYahooEtfHoldingFundamentals: mocks.fetchYahooEtfHoldingFundamentals,
}));

import type { CompanySearchResult } from "../../src/lib/analysis/types";
import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-07T11:45:00.000Z";
const company = {
  ticker: "LUND-B.ST",
  name: "L E Lundbergföretagen AB",
  securityType: "Common Stock" as const,
};

const reportedHoldings = [
  ["Lundbergs Fastigheter", 0.160],
  ["Holmen", 0.114],
  ["Hufvudstaden", 0.079],
  ["Husqvarna Group", 0.012],
  ["Industrivärden", 0.297],
  ["Indutrade", 0.127],
  ["Alleima", 0.014],
  ["Handelsbanken", 0.057],
  ["Sandvik", 0.099],
  ["Skanska", 0.035],
  ["Övriga värdepapper", 0.016],
] as const;

const rawWeightSum = reportedHoldings.reduce((sum, [, weight]) => sum + weight, 0);

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "lundbergs-holdings-fixture",
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
      price: 540,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 134_000_000_000,
      sharesOutstanding: 248_000_000,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
    engine: {
      metrics: {
        latestPeriod: {
          fiscalYear: 2025,
          periodEndDate: "2025-12-31",
          cashAndEquivalents: null,
          totalDebt: null,
        },
      },
    } as UniversalSecurityReport["engine"],
  };
}

function unavailable(provider: string) {
  return {
    ok: false as const,
    reason: "fixture_unavailable",
    message: "fixture unavailable",
    diagnostic: {
      provider,
      capability: "specialized" as const,
      status: "unavailable" as const,
      reason: "fixture_unavailable",
      observedAt,
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

function officialHoldingsSuccess() {
  return {
    ok: true as const,
    data: {
      holdings: reportedHoldings.map(([name, reportedWeight]) => ({
        name,
        reportedWeight,
        weight: reportedWeight / rawWeightSum,
      })),
      rawWeightSum,
      asOf: "2026-05-19",
      source: {
        name: "Lundbergs official portfolio",
        url: "https://www.lundbergforetagen.se/sv",
        accessedAt: observedAt,
        freshness: "official Lundbergs allocation fixture with raw gross exposure preserved",
        provider: "official-investment-company-holdings",
        capability: "specialized" as const,
        dataAsOf: "2026-05-19",
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

const tickerByName: Record<string, string> = {
  Holmen: "HOLM-B.ST",
  Hufvudstaden: "HUFV-A.ST",
  "Husqvarna Group": "HUSQ-B.ST",
  Industrivärden: "INDU-C.ST",
  Indutrade: "INDT.ST",
  Alleima: "ALLEI.ST",
  Handelsbanken: "SHB-A.ST",
  Sandvik: "SAND.ST",
  Skanska: "SKA-B.ST",
};

function qualitySuccess(ticker: string) {
  return {
    ok: true as const,
    data: {
      revenueGrowth: 0.08,
      epsGrowth: 0.10,
      roic: 0.15,
      operatingMargin: 0.16,
      sector: "Industrials",
      country: "Sweden",
    },
    source: {
      name: "Yahoo Finance holding fundamentals",
      url: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`,
      accessedAt: observedAt,
      freshness: "fixture",
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

describe("Lundbergs official-holdings production coverage", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreHoldingCompanyReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({ ok: true, data: report, sources: [], warnings: [] });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(unavailable("Official investment-company NAV"));
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(officialHoldingsSuccess());
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(unavailable("Official investment-company key ratios"));
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(unavailable("Official investment-company governance"));
    mocks.searchCompanies.mockImplementation(async (query: string): Promise<CompanySearchResult[]> => {
      const ticker = tickerByName[query];
      return ticker ? [{ ticker, canonicalTicker: ticker, name: query, securityType: "Common Stock" }] : [];
    });
    mocks.fetchYahooEtfHoldingFundamentals.mockImplementation(async (holding: { ticker?: string }) => qualitySuccess(holding.ticker ?? "UNKNOWN"));
  });

  it("uses normalized Lundbergs allocation for diversification while preserving 101% raw exposure and reaches verified 80% equity quality coverage", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const factors = Object.fromEntries((analysis?.score.factors ?? []).map((factor) => [factor.key, factor]));

    expect(rawWeightSum).toBeCloseTo(1.01, 12);
    expect(mocks.fetchOfficialInvestmentCompanyHoldings).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyHoldings).toHaveBeenCalledWith(company);
    expect(factors.diversification?.status).toBe("available");
    expect(factors.holdings_quality?.status).toBe("available");
    expect(analysis?.lookThrough.coveredWeight).toBeCloseTo(1, 12);
    expect(analysis?.lookThrough.qualityCoveredWeight).toBeGreaterThanOrEqual(0.80);
    expect(analysis?.lookThrough.stockBoxQuality).not.toBeNull();

    expect(mocks.searchCompanies).toHaveBeenCalledWith("Lundbergs Fastigheter");
    expect(mocks.searchCompanies).toHaveBeenCalledWith("Övriga värdepapper");
    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.some(([holding]) => holding.name === "Lundbergs Fastigheter")).toBe(false);
    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.some(([holding]) => holding.name === "Övriga värdepapper")).toBe(false);
    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.map(([holding]) => holding.ticker)).not.toContain(undefined);

    expect(report.dataCoverage).toBeCloseTo(0.23, 12);
    expect(report.sources.some((source) => source.name === "Lundbergs official portfolio" && source.provider === "official-investment-company-holdings")).toBe(true);
    expect(report.sources.some((source) => source.provider === "Yahoo Finance" && source.capability === "specialized")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => item.provider === "Official investment-company holdings" && item.status === "available")).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});
