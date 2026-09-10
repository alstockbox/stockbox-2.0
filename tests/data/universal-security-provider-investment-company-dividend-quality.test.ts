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

const observedAt = "2026-09-06T21:00:00.000Z";
const company = {
  ticker: "INDU-C.ST",
  name: "AB Industrivärden",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "industrivarden-dividend-quality-fixture",
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
  const dividendPerShare = 8;
  return {
    year,
    portfolioReturn: 0.1,
    netPurchasesSales: 1_000_000_000,
    netDebt: -5_000_000_000,
    debtEquitiesRatio: 0.04,
    navPerShare: 400,
    sharesOutstanding,
    dividendsPaid: sharesOutstanding * dividendPerShare,
    dividendPerShare,
    dividendsReceived: 7_000_000_000,
    ...overrides,
  };
}

function officialKeyRatiosSuccess(
  years: InvestmentCompanyKeyRatioYear[] = [2025, 2024, 2023, 2022, 2021].map((year) => keyRatioYear(year)),
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
        version: "v1",
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

describe("investment-company dividend-quality production wiring", () => {
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

  it("uses verified five-year official annual history to make dividend quality available without applying current-disclosure freshness", async () => {
    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const dividendQuality = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "dividend_quality",
    );
    const leverage = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "leverage",
    );

    expect(mocks.fetchOfficialInvestmentCompanyKeyRatios).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyKeyRatios).toHaveBeenCalledWith(company);
    expect(dividendQuality?.status).toBe("available");
    expect(dividendQuality?.value).toBe(100);
    expect(dividendQuality?.score).toBe(100);
    expect(leverage?.status).toBe("available");
    expect(leverage?.value).toBeCloseTo(0.04, 12);
    expect(report.dataCoverage).toBeCloseTo(0.27, 12);
    expect(report.sources.some((source) => source.provider === "official-investment-company-key-ratios")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company key ratios"
      && item.status === "available"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });

  it("retains inconsistent official history as provenance but keeps dividend quality N/A", async () => {
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValueOnce(officialKeyRatiosSuccess([
      keyRatioYear(2025, { dividendsPaid: 5_000_000_000 }),
      keyRatioYear(2024),
      keyRatioYear(2023),
      keyRatioYear(2022),
      keyRatioYear(2021),
    ]));

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const dividendQuality = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "dividend_quality",
    );

    expect(mocks.fetchOfficialInvestmentCompanyKeyRatios).toHaveBeenCalledTimes(1);
    expect(dividendQuality?.status).toBe("missing");
    expect(dividendQuality?.value).toBeNull();
    expect(report.sources.some((source) => source.provider === "official-investment-company-key-ratios")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company key ratios"
      && item.status === "partial"
      && item.reason === "dividend_accounting_reconciliation_failed"
    ))).toBe(true);
    expect(report.score.missingData.some((message) => (
      /dividend quality/i.test(message)
      && /reconciliation/i.test(message)
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});
