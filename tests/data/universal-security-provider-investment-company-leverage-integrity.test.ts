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

const observedAt = "2026-09-07T17:10:00.000Z";
const company = {
  ticker: "HOLD.ST",
  canonicalTicker: "HOLD.ST",
  name: "Verified NAV Holding AB",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(marketDate = "2026-09-05"): UniversalSecurityReport {
  return {
    id: "holding-leverage-integrity-fixture",
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
      price: 150,
      currency: "SEK",
      date: marketDate,
      volume: null,
      marketCap: 450_000_000_000,
      sharesOutstanding: 3_000_000_000,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
    engine: {
      metrics: {
        latestPeriod: {
          fiscalYear: Number(marketDate.slice(0, 4)) - 1,
          periodEndDate: `${Number(marketDate.slice(0, 4)) - 1}-12-31`,
          cashAndEquivalents: 10_000_000_000,
          totalDebt: 20_000_000_000,
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

function officialNavSuccess(navAsOf = "2026-09-05") {
  return {
    ok: true as const,
    data: {
      reportedNav: 600_000_000_000,
      reportedNavPerShare: 200,
      navAsOf,
      navPerShareHistory: [],
      annualNavPerShareHistory: [],
      historySource: null,
      source: {
        name: "Verified NAV Holding AB official NAV disclosure",
        url: "https://example.com/holding-nav",
        accessedAt: observedAt,
        freshness: "official fixture",
        provider: "official-investment-company-nav",
        capability: "specialized" as const,
        dataAsOf: navAsOf,
        version: "official-investment-company-nav-v2",
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

function officialKeyRatiosSuccess(year = 2025, debtEquitiesRatio = 0.04) {
  return {
    ok: true as const,
    data: {
      years: [{
        year,
        portfolioReturn: 0.1,
        benchmarkReturnSixrx: 0.08,
        netPurchasesSales: 0,
        netDebt: 24_000_000_000,
        debtEquitiesRatio,
        navPerShare: 200,
        sharesOutstanding: 3_000_000_000,
        dividendsPaid: 0,
        dividendPerShare: 0,
        dividendsReceived: 0,
      }],
      source: {
        name: "Verified NAV Holding AB official key ratios",
        url: "https://example.com/holding-key-ratios",
        accessedAt: observedAt,
        freshness: "official annual fixture",
        provider: "official-investment-company-key-ratios",
        capability: "specialized" as const,
        dataAsOf: `${year}-12-31`,
        version: "v2",
      },
      diagnostic: {
        provider: "Official investment-company key ratios",
        capability: "specialized" as const,
        status: "available" as const,
        observedAt,
      },
    },
  };
}

describe("investment-company leverage source integrity", () => {
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

  it("does not count generic corporate totalDebt as verified holding-company leverage", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const specialist = report.securityAnalysis?.investmentCompany;
    const nav = specialist?.score.factors.find((factor) => factor.key === "nav_valuation");
    const leverage = specialist?.score.factors.find((factor) => factor.key === "leverage");

    expect(nav?.status).toBe("available");
    expect(leverage?.status).toBe("missing");
    expect(leverage?.value).toBeNull();
    expect(report.dataCoverage).toBeCloseTo(0.22, 12);
    expect(report.recommendation).toBe("No Rating");
  });

  it("uses fresh verified issuer debt-equities ratio for holding-company leverage", async () => {
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValueOnce(officialKeyRatiosSuccess(2025, 0.04));

    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const leverage = report.securityAnalysis?.investmentCompany?.score.factors.find((factor) => factor.key === "leverage");

    expect(leverage?.status).toBe("available");
    expect(leverage?.value).toBeCloseTo(0.04, 12);
    expect(report.dataCoverage).toBeCloseTo(0.30, 12);
    expect(report.recommendation).toBe("No Rating");
    expect(report.sources.some((source) => source.provider === "official-investment-company-key-ratios")).toBe(true);
  });

  it("fails verified annual leverage closed when the latest ratio is more than one year behind the market year", async () => {
    const report = coreHoldingCompanyReport("2028-09-05");
    mocks.analyzeOperatingCompany.mockResolvedValueOnce({ ok: true, data: report, sources: report.sources, warnings: [] });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValueOnce(officialNavSuccess("2028-09-05"));
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValueOnce(officialKeyRatiosSuccess(2025, 0.04));

    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const analyzed = result.data as UniversalSecurityReport;
    const leverage = analyzed.securityAnalysis?.investmentCompany?.score.factors.find((factor) => factor.key === "leverage");

    expect(leverage?.status).toBe("missing");
    expect(leverage?.value).toBeNull();
    expect(analyzed.dataCoverage).toBeCloseTo(0.22, 12);
    expect(analyzed.recommendation).toBe("No Rating");
  });
});