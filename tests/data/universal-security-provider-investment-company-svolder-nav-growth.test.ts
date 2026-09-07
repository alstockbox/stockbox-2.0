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

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-07T14:25:00.000Z";
const annualHistoryUrl = "https://svolder.se/investor-relations/svolderaktien/";
const currentNavUrl = "https://svolder.se/pressreleaser/";
const company = {
  ticker: "SVOL-B.ST",
  canonicalTicker: "SVOL-B.ST",
  name: "Svolder AB",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "svolder-nav-growth-fixture",
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
      price: 52,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 5_300_000_000,
      sharesOutstanding: 102_400_000,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
    engine: {
      metrics: {
        latestPeriod: {
          fiscalYear: 2025,
          periodEndDate: "2025-08-31",
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

function officialNavSuccess(navAsOf = "2026-08-28") {
  return {
    ok: true as const,
    data: {
      reportedNav: null,
      reportedNavPerShare: 60,
      navAsOf,
      navPerShareHistory: [],
      annualNavPerShareHistory: [
        { year: 2025, navPerShare: 57.2 },
        { year: 2024, navPerShare: 58.8 },
        { year: 2023, navPerShare: 51.2 },
        { year: 2022, navPerShare: 57.3 },
        { year: 2021, navPerShare: 69.5 },
      ],
      historySource: {
        name: "Svolder AB official annual NAV history",
        url: annualHistoryUrl,
        accessedAt: observedAt,
        freshness: "annual official fixture",
        provider: "official-investment-company-nav",
        version: "official-investment-company-nav-annual-history-v1",
        capability: "specialized" as const,
        dataAsOf: null,
      },
      source: {
        name: "Svolder AB official NAV disclosure",
        url: currentNavUrl,
        accessedAt: observedAt,
        freshness: "current official fixture",
        provider: "official-investment-company-nav",
        version: "official-investment-company-nav-v3",
        capability: "specialized" as const,
        dataAsOf: navAsOf,
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

function navSources(report: UniversalSecurityReport) {
  return report.sources.filter((source) => source.provider === "official-investment-company-nav");
}

describe("Svolder annual NAV growth production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreHoldingCompanyReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({ ok: true, data: report, sources: report.sources, warnings: [] });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(officialNavSuccess());
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(unavailable("Official investment-company holdings"));
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(unavailable("Official investment-company key ratios"));
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(unavailable("Official investment-company governance"));
    mocks.searchCompanies.mockResolvedValue([]);
  });

  it("uses verified official Svolder fiscal-year NAV/share history for the 15% NAV-growth factor", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const navValuation = factor(report, "nav_valuation");
    const navGrowth = factor(report, "nav_growth");
    const expectedThreeYearCagr = (57.2 / 57.3) ** (1 / 3) - 1;

    expect(navValuation?.status).toBe("available");
    expect(navGrowth?.status).toBe("available");
    expect(navGrowth?.value).toBeCloseTo(expectedThreeYearCagr, 12);
    expect(report.dataCoverage).toBeCloseTo(0.37, 12);
    expect(report.recommendation).toBe("No Rating");
    expect(navSources(report)).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: currentNavUrl, version: "official-investment-company-nav-v3" }),
      expect.objectContaining({ url: annualHistoryUrl, version: "official-investment-company-nav-annual-history-v1" }),
    ]));
    expect(result.sources.filter((source) => source.provider === "official-investment-company-nav")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: currentNavUrl }),
        expect.objectContaining({ url: annualHistoryUrl }),
      ]),
    );
  });

  it("keeps annual NAV growth eligible when current NAV is stale while retaining both sources as provenance", async () => {
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValueOnce(officialNavSuccess("2025-01-01"));

    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const navValuation = factor(report, "nav_valuation");
    const navGrowth = factor(report, "nav_growth");
    const expectedThreeYearCagr = (57.2 / 57.3) ** (1 / 3) - 1;

    expect(navValuation?.status).toBe("missing");
    expect(navGrowth?.status).toBe("available");
    expect(navGrowth?.value).toBeCloseTo(expectedThreeYearCagr, 12);
    expect(report.dataCoverage).toBeCloseTo(0.15, 12);
    expect(report.recommendation).toBe("No Rating");
    expect(navSources(report)).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: currentNavUrl, dataAsOf: "2025-01-01" }),
      expect.objectContaining({ url: annualHistoryUrl, version: "official-investment-company-nav-annual-history-v1" }),
    ]));
    expect(result.sources.filter((source) => source.provider === "official-investment-company-nav")).toHaveLength(2);
  });
});