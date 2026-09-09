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

const observedAt = "2026-09-07T16:45:00.000Z";
const company = {
  ticker: "CRED-A.ST",
  canonicalTicker: "CRED-A.ST",
  name: "Creades AB",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "creades-governance-fixture",
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
      price: 74,
      currency: "SEK",
      date: "2026-09-07",
      volume: null,
      marketCap: 8_000_000_000,
      sharesOutstanding: 108_000_000,
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

function officialGovernanceSuccess() {
  return {
    ok: true as const,
    data: {
      directors: [
        { name: "Sven Hagströmer", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
        { name: "Cecilia Hermansson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Peter Nilsson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Maria Rankka", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Anna Settman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Lars Stugemo", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Hans Toll", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      ],
      sources: [
        {
          name: "Creades 2026 Nomination Committee board independence information",
          url: "https://www.creades.se/media/0mfj3ehw/valberedningens-f%C3%B6rslag-%C3%A5rsst%C3%A4mma-2026.pdf",
          accessedAt: observedAt,
          freshness: "versioned official governance fixture",
          provider: "official-investment-company-governance",
          version: "official-investment-company-governance-v1",
          capability: "specialized" as const,
        },
        {
          name: "Creades current Board of Directors",
          url: "https://www.creades.se/bolagsstyrning/styrelse-ledande-befattningshavare-och-revisor/",
          accessedAt: observedAt,
          freshness: "live official roster fixture",
          provider: "official-investment-company-governance",
          version: "official-investment-company-governance-v1",
          capability: "specialized" as const,
        },
      ],
      diagnostic: {
        provider: "Official investment-company governance",
        capability: "specialized" as const,
        status: "available" as const,
        observedAt,
      },
    },
  };
}

describe("Creades governance production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreHoldingCompanyReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({ ok: true, data: report, sources: report.sources, warnings: [] });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(unavailable("Official investment-company NAV"));
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(unavailable("Official investment-company holdings"));
    mocks.fetchYahooLongHistory.mockResolvedValue(unavailableLongHistory());
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(unavailable("Official investment-company key ratios"));
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(officialGovernanceSuccess());
    mocks.searchCompanies.mockResolvedValue([]);
  });

  it("feeds verified Creades independence evidence into governance without bypassing the 99% rating gate", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const governance = report.securityAnalysis?.investmentCompany?.score.factors.find((factor) => factor.key === "governance");

    expect(mocks.fetchOfficialInvestmentCompanyGovernance).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyGovernance).toHaveBeenCalledWith(company);
    expect(governance?.status).toBe("available");
    expect(governance?.value).toBeCloseTo(92.8571428571, 8);
    expect(governance?.score).toBeCloseTo(92.8571428571, 8);
    expect(report.dataCoverage).toBeCloseTo(0.06, 12);
    expect(report.sources.filter((source) => source.provider === "official-investment-company-governance")).toHaveLength(2);
    expect(result.sources.filter((source) => source.provider === "official-investment-company-governance")).toHaveLength(2);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company governance"
      && item.status === "available"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});
