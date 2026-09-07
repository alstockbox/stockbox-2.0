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

const observedAt = "2026-09-07T09:15:00.000Z";
const company = {
  ticker: "SVOL-B.ST",
  name: "Svolder AB",
  securityType: "Common Stock" as const,
};

const holdings = [
  ["Ependion", 0.146],
  ["New Wave Group", 0.120],
  ["Beijer Alma", 0.100],
  ["Scandic Hotels Group", 0.090],
  ["FM Mattsson Group", 0.073],
  ["Troax Group", 0.066],
  ["Systemair", 0.061],
  ["Arjo", 0.055],
  ["Platzer Fastigheter", 0.049],
  ["MilDef Group", 0.042],
  ["Elanders", 0.036],
  ["XANO Industri", 0.035],
  ["ITAB Shop Concept", 0.033],
  ["Arla Plast", 0.019],
  ["GARO", 0.017],
  ["Boule Diagnostics", 0.002],
  ["Net receivable / cash", 0.056],
] as const;

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "svolder-holdings-fixture",
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
      price: 62,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 5_600_000_000,
      sharesOutstanding: 90_000_000,
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
      holdings: holdings.map(([name, weight]) => ({ name, reportedWeight: weight, weight })),
      rawWeightSum: 1,
      asOf: "2026-05-31",
      source: {
        name: "Svolder official portfolio",
        url: "https://svolder.se/om-svolder/innehav/",
        accessedAt: observedAt,
        freshness: "complete official Svolder NAV exposure fixture",
        provider: "official-investment-company-holdings",
        capability: "specialized" as const,
        dataAsOf: "2026-05-31",
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
  Ependion: "EPEN.ST",
  "New Wave Group": "NEWA-B.ST",
  "Beijer Alma": "BEIA-B.ST",
  "Scandic Hotels Group": "SHOT.ST",
  "FM Mattsson Group": "FMM-B.ST",
  "Troax Group": "TROAX.ST",
  Systemair: "SYSR.ST",
  Arjo: "ARJO-B.ST",
  "Platzer Fastigheter": "PLAZ-B.ST",
  "MilDef Group": "MILDEF.ST",
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

describe("Svolder official-holdings production coverage", () => {
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

  it("uses complete Svolder NAV exposure for diversification and enriches only real equities until 80% quality coverage", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const factors = Object.fromEntries((analysis?.score.factors ?? []).map((factor) => [factor.key, factor]));

    expect(mocks.fetchOfficialInvestmentCompanyHoldings).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyHoldings).toHaveBeenCalledWith(company);
    expect(factors.diversification?.status).toBe("available");
    expect(factors.holdings_quality?.status).toBe("available");
    expect(analysis?.lookThrough.coveredWeight).toBeCloseTo(1, 12);
    expect(analysis?.lookThrough.qualityCoveredWeight).toBeGreaterThanOrEqual(0.80);
    expect(analysis?.lookThrough.stockBoxQuality).not.toBeNull();

    expect(mocks.searchCompanies.mock.calls.map(([query]) => query)).toEqual([
      "Ependion",
      "New Wave Group",
      "Beijer Alma",
      "Scandic Hotels Group",
      "FM Mattsson Group",
      "Troax Group",
      "Systemair",
      "Net receivable / cash",
      "Arjo",
      "Platzer Fastigheter",
      "MilDef Group",
    ]);
    expect(mocks.fetchYahooEtfHoldingFundamentals).toHaveBeenCalledTimes(10);
    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.map(([holding]) => holding.ticker)).not.toContain(undefined);
    expect(mocks.fetchYahooEtfHoldingFundamentals.mock.calls.some(([holding]) => holding.name === "Net receivable / cash")).toBe(false);

    expect(report.dataCoverage).toBeCloseTo(0.23, 12);
    expect(report.sources.some((source) => source.name === "Svolder official portfolio" && source.provider === "official-investment-company-holdings")).toBe(true);
    expect(report.sources.some((source) => source.provider === "Yahoo Finance" && source.capability === "specialized")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => item.provider === "Official investment-company holdings" && item.status === "available")).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});
