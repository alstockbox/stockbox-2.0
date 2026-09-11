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

const observedAt = "2026-09-08T09:15:00.000Z";
const leverageUrl = "https://news.cision.com/investment-ab-latour/r/interim-report-january---june-2026%2Cc4384935";
const company = {
  ticker: "LATO-B.ST",
  canonicalTicker: "LATO-B.ST",
  name: "Investment AB Latour",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "latour-leverage-fixture",
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

function officialLeverageSuccess(asOf = "2026-06-30") {
  return {
    ok: true as const,
    data: {
      ratio: 0.09,
      netDebtExcludingIfrs16: 12_281_000_000,
      asOf,
      source: {
        name: "Latour H1 2026 issuer leverage disclosure",
        url: leverageUrl,
        accessedAt: observedAt,
        freshness: "fixture",
        provider: "official-investment-company-leverage",
        version: "official-investment-company-leverage-v1",
        capability: "specialized" as const,
        dataAsOf: asOf,
      },
      diagnostic: {
        provider: "Official investment-company leverage",
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

describe("Latour current leverage production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreHoldingCompanyReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({
      ok: true,
      data: report,
      sources: report.sources,
      warnings: [],
    });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(unavailable("Official investment-company NAV"));
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(unavailable("Official investment-company holdings"));
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(unavailable("Official investment-company key ratios"));
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(unavailable("Official investment-company governance"));
    mocks.fetchOfficialInvestmentCompanyLeverage.mockResolvedValue(officialLeverageSuccess());
    mocks.searchCompanies.mockResolvedValue([]);
  });

  it("uses fresh issuer-defined Latour leverage directly and gives exactly the 8% leverage factor coverage", async () => {
    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const leverage = factor(report, "leverage");

    expect(mocks.fetchOfficialInvestmentCompanyLeverage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyLeverage).toHaveBeenCalledWith(company);
    expect(leverage?.status).toBe("available");
    expect(leverage?.value).toBeCloseTo(0.09, 12);
    expect(report.dataCoverage).toBeCloseTo(0.08, 12);
    expect(report.recommendation).toBe("No Rating");
    expect(report.sources.some((source) => (
      source.provider === "official-investment-company-leverage"
      && source.url === leverageUrl
    ))).toBe(true);
    expect(result.sources.some((source) => (
      source.provider === "official-investment-company-leverage"
      && source.url === leverageUrl
    ))).toBe(true);
    expect(report.providerDiagnostics?.some((diagnostic) => (
      diagnostic.provider === "Official investment-company leverage"
      && diagnostic.status === "available"
    ))).toBe(true);
  });

  it("retains stale Latour leverage provenance but fails the leverage factor closed", async () => {
    mocks.fetchOfficialInvestmentCompanyLeverage.mockResolvedValueOnce(
      officialLeverageSuccess("2025-12-31"),
    );

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const leverage = factor(report, "leverage");

    expect(leverage?.status).toBe("missing");
    expect(leverage?.value).toBeNull();
    expect(report.dataCoverage).toBeCloseTo(0, 12);
    expect(report.recommendation).toBe("No Rating");
    expect(report.sources.some((source) => source.provider === "official-investment-company-leverage")).toBe(true);
    expect(report.providerDiagnostics?.some((diagnostic) => (
      diagnostic.provider === "Official investment-company leverage"
      && diagnostic.status === "partial"
      && diagnostic.reason === "official_leverage_stale_or_unverifiable_for_market_comparison"
    ))).toBe(true);
    expect(report.score.missingData.some((message) => /leverage/i.test(message) && /stale/i.test(message))).toBe(true);
  });
});
