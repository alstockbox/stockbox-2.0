import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InvestmentCompanyKeyRatioYear } from "../../src/lib/data/official-investment-company-key-ratios";

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

vi.mock("@/lib/data/official-investment-company-key-ratios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/data/official-investment-company-key-ratios")>();
  return {
    ...actual,
    fetchOfficialInvestmentCompanyKeyRatios: mocks.fetchOfficialInvestmentCompanyKeyRatios,
  };
});

vi.mock("@/lib/data/official-investment-company-governance", () => ({
  fetchOfficialInvestmentCompanyGovernance: mocks.fetchOfficialInvestmentCompanyGovernance,
}));

vi.mock("@/lib/data/yahoo-etf-holding-fundamentals", () => ({
  fetchYahooEtfHoldingFundamentals: mocks.fetchYahooEtfHoldingFundamentals,
}));

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-07T13:20:00.000Z";
const company = {
  ticker: "INDU-C.ST",
  name: "AB Industrivärden",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(marketDate = "2026-09-05"): UniversalSecurityReport {
  return {
    id: "industrivarden-nav-growth-fixture",
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
      date: marketDate,
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
          fiscalYear: Number(marketDate.slice(0, 4)) - 1,
          periodEndDate: `${Number(marketDate.slice(0, 4)) - 1}-12-31`,
          cashAndEquivalents: 2_000_000_000,
          totalDebt: 8_000_000_000,
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

function officialNavSuccess(
  navAsOf = "2026-06-30",
  navPerShareHistory: Array<{ date: string; navPerShare: number }> = [],
) {
  return {
    ok: true as const,
    data: {
      reportedNav: 216_000_000_000,
      reportedNavPerShare: 500,
      navAsOf,
      navPerShareHistory,
      source: {
        name: "Industrivärden official NAV disclosure",
        url: "https://www.industrivarden.se/en-gb/investors/the-industrivarden-share/net-asset-value/",
        accessedAt: observedAt,
        freshness: "current official NAV fixture",
        provider: "official-investment-company-nav",
        capability: "specialized" as const,
        dataAsOf: navAsOf,
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

function keyRatioYear(
  year: number,
  navPerShare: number,
  overrides: Partial<InvestmentCompanyKeyRatioYear> = {},
): InvestmentCompanyKeyRatioYear {
  const sharesOutstanding = 400_000_000;
  const dividendPerShare = 7.5;
  return {
    year,
    portfolioReturn: 0.10,
    benchmarkReturnSixrx: 0.10,
    netPurchasesSales: 2_000_000_000,
    netDebt: -5_000_000_000,
    debtEquitiesRatio: 0.04,
    navPerShare,
    sharesOutstanding,
    dividendsPaid: sharesOutstanding * dividendPerShare,
    dividendPerShare,
    dividendsReceived: 6_000_000_000,
    ...overrides,
  };
}

function defaultKeyRatioYears(): InvestmentCompanyKeyRatioYear[] {
  return [
    keyRatioYear(2025, 300),
    keyRatioYear(2024, 285),
    keyRatioYear(2023, 270),
    keyRatioYear(2022, 250),
    keyRatioYear(2021, 225),
    keyRatioYear(2020, 200),
  ];
}

function officialKeyRatiosSuccess(years = defaultKeyRatioYears()) {
  return {
    ok: true as const,
    data: {
      years,
      source: {
        name: "Industrivärden official key ratios",
        url: "https://www.industrivarden.se/en-gb/investors/industrivarden-in-figures/key-ratios/",
        accessedAt: observedAt,
        freshness: "official annual history fixture",
        provider: "official-investment-company-key-ratios",
        capability: "specialized" as const,
        dataAsOf: `${years[0]?.year ?? 2025}-12-31`,
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

describe("Industrivärden annual NAV-growth production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.analyzeOperatingCompany.mockResolvedValue({
      ok: true,
      data: coreHoldingCompanyReport(),
      sources: [],
      warnings: [],
    });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(officialNavSuccess());
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(unavailable("Official investment-company holdings"));
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(officialKeyRatiosSuccess());
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(unavailable("Official investment-company governance"));
    mocks.searchCompanies.mockResolvedValue([]);
  });

  it("reuses verified annual NAV/share key ratios for NAV growth without inventing calendar-date observations", async () => {
    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const navGrowth = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "nav_growth",
    );
    const expected5yCagr = (300 / 200) ** (1 / 5) - 1;

    expect(mocks.fetchOfficialInvestmentCompanyKeyRatios).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyKeyRatios).toHaveBeenCalledWith(company);
    expect(navGrowth?.status).toBe("available");
    expect(navGrowth?.value).toBeCloseTo(expected5yCagr, 12);
    expect(report.dataCoverage).toBeCloseTo(0.61, 12);
    expect(report.sources.some((source) => source.provider === "official-investment-company-key-ratios")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company key ratios"
      && item.status === "available"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });

  it("fails annual NAV growth closed when the latest annual observation is more than one year behind the market year", async () => {
    mocks.analyzeOperatingCompany.mockResolvedValueOnce({
      ok: true,
      data: coreHoldingCompanyReport("2028-09-05"),
      sources: [],
      warnings: [],
    });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValueOnce(officialNavSuccess("2028-06-30"));

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const navGrowth = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "nav_growth",
    );

    expect(navGrowth?.status).toBe("missing");
    expect(navGrowth?.value).toBeNull();
    expect(report.dataCoverage).toBeCloseTo(0.46, 12);
    expect(report.recommendation).toBe("No Rating");
  });

  it("uses annual history for missing longer periods when fresh dated NAV history only supports a shorter period", async () => {
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValueOnce(officialNavSuccess("2026-06-30", [
      { date: "2025-06-30", navPerShare: 450 },
      { date: "2026-06-30", navPerShare: 500 },
    ]));

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const navGrowth = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "nav_growth",
    );
    const expected5yCagr = (300 / 200) ** (1 / 5) - 1;

    expect(navGrowth?.status).toBe("available");
    expect(navGrowth?.value).toBeCloseTo(expected5yCagr, 12);
    expect(report.dataCoverage).toBeCloseTo(0.61, 12);
    expect(report.recommendation).toBe("No Rating");
  });
});
