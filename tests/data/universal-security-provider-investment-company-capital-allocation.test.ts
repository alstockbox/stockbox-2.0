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

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-06T22:15:00.000Z";
const company = {
  ticker: "INDU-C.ST",
  name: "AB Industrivärden",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "industrivarden-capital-allocation-fixture",
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
      performance: {
        "1D": undefined,
        "1W": undefined,
        "1M": undefined,
        "3M": undefined,
        "6M": undefined,
        "YTD": undefined,
        "1Y": undefined,
      },
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

function keyRatioYear(
  year: number,
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
    navPerShare: 300,
    sharesOutstanding,
    dividendsPaid: sharesOutstanding * dividendPerShare,
    dividendPerShare,
    dividendsReceived: 6_000_000_000,
    ...overrides,
  };
}

function officialKeyRatiosSuccess(
  years: InvestmentCompanyKeyRatioYear[] = [2025, 2024, 2023, 2022, 2021, 2020].map((year) => keyRatioYear(year)),
) {
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
        dataAsOf: "2025-12-31",
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

describe("investment-company capital-allocation production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.analyzeOperatingCompany.mockResolvedValue({
      ok: true,
      data: coreHoldingCompanyReport(),
      sources: [],
      warnings: [],
    });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(unavailable("Official investment-company NAV"));
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(unavailable("Official investment-company holdings"));
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(officialKeyRatiosSuccess());
    mocks.searchCompanies.mockResolvedValue([]);
  });

  it("reuses one verified official key-ratio fetch to make capital allocation available and preserves provenance", async () => {
    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const capitalAllocation = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "capital_allocation",
    );

    expect(mocks.fetchOfficialInvestmentCompanyKeyRatios).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyKeyRatios).toHaveBeenCalledWith(company);
    expect(capitalAllocation?.status).toBe("available");
    expect(capitalAllocation?.value).toBeCloseTo(70, 12);
    expect(capitalAllocation?.score).toBeCloseTo(70, 12);
    expect(report.dataCoverage).toBeCloseTo(0.16, 12);
    expect(report.sources.some((source) => source.provider === "official-investment-company-key-ratios")).toBe(true);
    expect(result.sources.some((source) => source.provider === "official-investment-company-key-ratios")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company key ratios"
      && item.status === "available"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });

  it("retains successful provider evidence but fails capital allocation closed when benchmark history is incomplete", async () => {
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValueOnce(officialKeyRatiosSuccess([
      keyRatioYear(2025),
      keyRatioYear(2024),
      keyRatioYear(2023, { benchmarkReturnSixrx: undefined }),
      keyRatioYear(2022),
      keyRatioYear(2021),
      keyRatioYear(2020),
    ]));

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const capitalAllocation = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "capital_allocation",
    );

    expect(mocks.fetchOfficialInvestmentCompanyKeyRatios).toHaveBeenCalledTimes(1);
    expect(capitalAllocation?.status).toBe("missing");
    expect(capitalAllocation?.value).toBeNull();
    expect(report.dataCoverage).toBeCloseTo(0.04, 12);
    expect(report.sources.some((source) => source.provider === "official-investment-company-key-ratios")).toBe(true);
    expect(result.sources.some((source) => source.provider === "official-investment-company-key-ratios")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company key ratios"
      && item.status === "available"
    ))).toBe(true);
    expect(report.score.missingData.some((message) => (
      /capital allocation/i.test(message)
      && /incomplete benchmark history/i.test(message)
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});
