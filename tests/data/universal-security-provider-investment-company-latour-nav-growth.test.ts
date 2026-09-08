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
  fetchOfficialInvestmentCompanyLeverage: vi.fn(),
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

vi.mock("@/lib/data/official-investment-company-leverage", () => ({
  fetchOfficialInvestmentCompanyLeverage: mocks.fetchOfficialInvestmentCompanyLeverage,
}));

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-07T17:40:00.000Z";
const navUrl = "https://www.latour.se/sv/investerare/substansvarde";
const company = {
  ticker: "LATO-B.ST",
  canonicalTicker: "LATO-B.ST",
  name: "Investment AB Latour",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "latour-nav-growth-fixture",
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
      price: 250,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 160_000_000_000,
      sharesOutstanding: 640_000_000,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
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

function officialNavSuccess() {
  return {
    ok: true as const,
    data: {
      reportedNav: 129_900_000_000,
      reportedNavPerShare: 203,
      navAsOf: "2026-06-30",
      navPerShareHistory: [
        { date: "2023-06-30", navPerShare: 193 },
        { date: "2025-06-30", navPerShare: 196 },
        { date: "2026-06-30", navPerShare: 203 },
      ],
      annualNavPerShareHistory: [],
      historySource: null,
      source: {
        name: "Investment AB Latour official NAV disclosure",
        url: navUrl,
        accessedAt: observedAt,
        freshness: "Q2 2026 official NAV fixture",
        provider: "official-investment-company-nav",
        version: "official-investment-company-nav-v3",
        capability: "specialized" as const,
        dataAsOf: "2026-06-30",
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

function factor(report: UniversalSecurityReport, key: string) {
  return report.securityAnalysis?.investmentCompany?.score.factors.find((item) => item.key === key);
}

describe("Latour quarterly NAV-growth production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreHoldingCompanyReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({
      ok: true,
      data: report,
      sources: report.sources,
      warnings: [],
    });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(officialNavSuccess());
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(unavailable("Official investment-company holdings"));
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(unavailable("Official investment-company key ratios"));
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(unavailable("Official investment-company governance"));
    mocks.fetchOfficialInvestmentCompanyLeverage.mockResolvedValue(unavailable("Official investment-company leverage"));
    mocks.searchCompanies.mockResolvedValue([]);
  });

  it("uses exact Q2-to-Q2 official NAV/share history for Latour 3Y growth and preserves the 99% gate", async () => {
    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const navValuation = factor(report, "nav_valuation");
    const navGrowth = factor(report, "nav_growth");
    const leverage = factor(report, "leverage");
    const expectedThreeYearCagr = (203 / 193) ** (1 / 3) - 1;
    const oneYearGrowth = (203 / 196) - 1;

    expect(navValuation?.status).toBe("available");
    expect(navGrowth?.status).toBe("available");
    expect(navGrowth?.value).toBeCloseTo(expectedThreeYearCagr, 12);
    expect(navGrowth?.value).not.toBeCloseTo(oneYearGrowth, 6);
    expect(leverage?.status).toBe("missing");
    expect(report.dataCoverage).toBeCloseTo(0.37, 12);
    expect(report.recommendation).toBe("No Rating");
    expect(report.sources.filter((source) => (
      source.provider === "official-investment-company-nav"
      && source.url === navUrl
    ))).toHaveLength(1);
    expect(result.sources.filter((source) => (
      source.provider === "official-investment-company-nav"
      && source.url === navUrl
    ))).toHaveLength(1);
    expect(report.providerDiagnostics?.some((diagnostic) => (
      diagnostic.provider === "Official investment-company NAV"
      && diagnostic.status === "available"
    ))).toBe(true);
  });
});
