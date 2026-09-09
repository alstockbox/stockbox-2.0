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

const observedAt = "2026-09-07T16:25:00.000Z";
const company = {
  ticker: "CRED-A.ST",
  canonicalTicker: "CRED-A.ST",
  name: "Creades AB",
  securityType: "Common Stock" as const,
};

const holdings = [
  ["Avanza", 0.49, true],
  ["Silex", 0.15, true],
  ["Apotea", 0.01, true],
  ["Seafire", 0.01, true],
  ["Klarna", 0.01, true],
  ["Aktiv förvaltning i kapitalförsäkring", 0.17, false],
  ["StickerApp", 0.04, false],
  ["Instabee", 0.03, false],
  ["Inet", 0.02, false],
  ["Lumene", 0.02, false],
  ["Mentimeter", 0.01, false],
  ["Röhnisch", 0.01, false],
  ["Findity", 0.01, false],
  ["Nordic Knots", 0.01, false],
  ["Övriga onoterade värdepapper", 0.01, false],
] as const;

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "creades-holdings-fixture",
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
      revenueGrowth1y: null, revenueCagr3y: null, epsGrowth1y: null,
      grossMargin: null, operatingMargin: null, netMargin: null,
      fcf: null, fcfMargin: null, cashConversion: null,
      debtToEquity: null, debtToAssets: null, netDebt: null,
      interestCoverage: null, earningsYield: null, fcfYield: null,
      priceMomentum1y: null, priceMomentum3m: null,
    },
    score: { score: null, personalizedScore: null, confidence: 60, dimensions: [], missingData: [] },
    dcf: { suitable: false, reason: "fixture", bear: null, base: null, bull: null },
    redFlags: [], greenFlags: [], scenarios: [], sources: [], disclaimer: "fixture",
    modelVersion: "fixture", reportSchemaVersion: "fixture", dataCoverage: 0,
    dataStatus: "current", providerDiagnostics: [], analysisArchetype: "holding_company",
    market: {
      ticker: company.ticker,
      price: 92,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 13_000_000_000,
      sharesOutstanding: 141_000_000,
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
      holdings: holdings.map(([name, weight, issuerFundamentalsEligible]) => ({
        name,
        reportedWeight: weight,
        weight,
        issuerFundamentalsEligible,
      })),
      rawWeightSum: 1,
      asOf: "2026-08-31",
      source: {
        name: "Creades official NAV portfolio",
        url: "https://www.creades.se/innehav/substansvarde/",
        accessedAt: observedAt,
        freshness: "official Creades NAV portfolio fixture",
        provider: "official-investment-company-holdings",
        capability: "specialized" as const,
        dataAsOf: "2026-08-31",
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
  Avanza: "AZA.ST",
  Silex: "SILEX.TEST",
  Apotea: "APOTEA.ST",
  Seafire: "SEAF.ST",
  Klarna: "KLAR.TEST",
};

function qualitySuccess(ticker: string) {
  return {
    ok: true as const,
    data: {
      revenueGrowth: 0.08,
      epsGrowth: 0.10,
      roic: 0.15,
      operatingMargin: 0.16,
      sector: "Technology",
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

describe("Creades official-holdings production boundary", () => {
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

  it("uses the full NAV portfolio for diversification but refuses to manufacture 80% holdings-quality coverage from aggregate or unlisted exposures", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const factors = Object.fromEntries((analysis?.score.factors ?? []).map((factor) => [factor.key, factor]));

    expect(factors.diversification?.status).toBe("available");
    expect(factors.holdings_quality?.status).toBe("missing");
    expect(analysis?.lookThrough.coveredWeight).toBeCloseTo(1, 12);
    expect(analysis?.lookThrough.qualityCoveredWeight).toBeCloseTo(0.67, 12);
    expect(analysis?.lookThrough.stockBoxQuality).toBeNull();

    expect(mocks.searchCompanies).toHaveBeenCalledTimes(5);
    expect(mocks.searchCompanies).not.toHaveBeenCalledWith("Aktiv förvaltning i kapitalförsäkring");
    expect(mocks.searchCompanies).not.toHaveBeenCalledWith("StickerApp");
    expect(mocks.searchCompanies).not.toHaveBeenCalledWith("Instabee");
    expect(mocks.searchCompanies).not.toHaveBeenCalledWith("Övriga onoterade värdepapper");
    expect(mocks.fetchYahooEtfHoldingFundamentals).toHaveBeenCalledTimes(5);
    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.some(([holding]) => holding.name === "Aktiv förvaltning i kapitalförsäkring")).toBe(false);
    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.some(([holding]) => holding.name === "StickerApp")).toBe(false);

    expect(report.dataCoverage).toBeCloseTo(0.05, 12);
    expect(report.sources.some((source) => source.name === "Creades official NAV portfolio" && source.provider === "official-investment-company-holdings")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => item.provider === "Official investment-company holdings" && item.status === "available")).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});