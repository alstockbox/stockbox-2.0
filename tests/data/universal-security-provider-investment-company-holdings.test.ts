import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeOperatingCompany: vi.fn(),
  fetchConfiguredMarketData: vi.fn(),
  fetchOfficialInvestmentCompanyNav: vi.fn(),
  fetchOfficialInvestmentCompanyHoldings: vi.fn(),
  fetchYahooLongHistory: vi.fn(),
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

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-06T20:00:00.000Z";
const company = {
  ticker: "INDU-C.ST",
  name: "AB Industrivärden",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "industrivarden-fixture",
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
      performance: { "1D": undefined, "1W": undefined, "1M": undefined, "3M": undefined, "6M": undefined, "YTD": undefined, "1Y": undefined },
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

function officialHoldingsSuccess(asOf = "2026-06-30") {
  const reported = [0.33, 0.29, 0.15, 0.10, 0.04, 0.04, 0.04, 0.02];
  const rawWeightSum = reported.reduce((sum, weight) => sum + weight, 0);
  const names = ["Sandvik", "Volvo", "Handelsbanken", "Essity", "Ericsson", "SCA", "Skanska", "Alleima"];
  return {
    ok: true as const,
    data: {
      holdings: names.map((name, index) => ({
        name,
        reportedWeight: reported[index],
        weight: reported[index] / rawWeightSum,
      })),
      rawWeightSum,
      asOf,
      source: {
        name: "Industrivärden official portfolio",
        url: "https://www.industrivarden.se/en-gb/operations/portfolio/ownership-and-development/",
        accessedAt: observedAt,
        freshness: "official fixture",
        provider: "official-investment-company-holdings",
        capability: "specialized" as const,
        dataAsOf: asOf,
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

describe("investment-company official holdings production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreHoldingCompanyReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({ ok: true, data: report, sources: [], warnings: [] });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(officialNavSuccess());
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(officialHoldingsSuccess());
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
  });

  it("uses fresh complete official holdings for diversification without inventing holdings quality", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const diversification = analysis?.score.factors.find((factor) => factor.key === "diversification");
    const holdingsQuality = analysis?.score.factors.find((factor) => factor.key === "holdings_quality");

    expect(mocks.fetchOfficialInvestmentCompanyHoldings).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyHoldings).toHaveBeenCalledWith(company);
    expect(analysis?.lookThrough.holdingsHhi).not.toBeNull();
    expect(analysis?.lookThrough.holdingsHhi).toBeCloseTo(
      officialHoldingsSuccess().data.holdings.reduce((sum, holding) => sum + holding.weight ** 2, 0),
      12,
    );
    expect(diversification?.status).toBe("available");
    expect(holdingsQuality?.status).toBe("missing");
    expect(analysis?.lookThrough.stockBoxQuality).toBeNull();
    expect(report.sources.some((source) => source.provider === "official-investment-company-holdings")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => item.provider === "Official investment-company holdings" && item.status === "available")).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });

  it("keeps stale official holdings as provenance but excludes them from diversification coverage", async () => {
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValueOnce(officialHoldingsSuccess("2026-05-07"));

    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const diversification = analysis?.score.factors.find((factor) => factor.key === "diversification");

    expect(report.sources.some((source) => source.provider === "official-investment-company-holdings")).toBe(true);
    expect(analysis?.lookThrough.holdingsHhi).toBeNull();
    expect(diversification?.status).toBe("missing");
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company holdings"
      && item.status === "partial"
      && item.reason === "official_holdings_stale_or_unverifiable_for_market_comparison"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});
