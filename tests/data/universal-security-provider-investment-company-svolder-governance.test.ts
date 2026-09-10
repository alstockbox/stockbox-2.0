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

const observedAt = "2026-09-07T11:20:00.000Z";
const company = {
  ticker: "SVOL-B.ST",
  canonicalTicker: "SVOL-B.ST",
  name: "Svolder AB",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "svolder-governance-fixture",
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

function officialGovernanceSuccess() {
  return {
    ok: true as const,
    data: {
      directors: [
        { name: "Fredrik Carlsson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Johan Lundberg", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Anna-Maria Lundström Törnblom", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
        { name: "Clas-Göran Lyrhem", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Magnus Malm", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Pernilla Ramslöv", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
      ],
      sources: [
        {
          name: "Svolder current Board of Directors and independence relationships",
          url: "https://svolder.se/bolagsstyrning/styrelse/",
          accessedAt: observedAt,
          freshness: "live official fixture",
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

describe("Svolder governance production wiring", () => {
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

  it("feeds live official Svolder independence evidence into the 6% governance factor", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const governance = report.securityAnalysis?.investmentCompany?.score.factors.find((factor) => factor.key === "governance");

    expect(mocks.fetchOfficialInvestmentCompanyGovernance).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyGovernance).toHaveBeenCalledWith(company);
    expect(governance?.status).toBe("available");
    expect(governance?.value).toBeCloseTo(91.6666666667, 8);
    expect(governance?.score).toBeCloseTo(91.6666666667, 8);
    expect(report.dataCoverage).toBeCloseTo(0.06, 12);
    expect(report.sources.filter((source) => source.provider === "official-investment-company-governance")).toHaveLength(1);
    expect(result.sources.filter((source) => source.provider === "official-investment-company-governance")).toHaveLength(1);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company governance"
      && item.status === "available"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });

  it("keeps Svolder governance missing when the live independence evidence is incomplete", async () => {
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValueOnce({
      ok: false as const,
      reason: "svolder_governance_independence_evidence_unavailable",
      message: "The current official Svolder page does not contain complete governance evidence.",
      diagnostic: {
        provider: "Official investment-company governance",
        capability: "specialized" as const,
        status: "unavailable" as const,
        reason: "svolder_governance_independence_evidence_unavailable",
        observedAt,
      },
    });

    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const governance = report.securityAnalysis?.investmentCompany?.score.factors.find((factor) => factor.key === "governance");

    expect(governance?.status).toBe("missing");
    expect(governance?.value).toBeNull();
    expect(report.dataCoverage).toBeCloseTo(0, 12);
    expect(report.sources.some((source) => source.provider === "official-investment-company-governance")).toBe(false);
    expect(result.sources.some((source) => source.provider === "official-investment-company-governance")).toBe(false);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company governance"
      && item.status === "unavailable"
      && item.reason === "svolder_governance_independence_evidence_unavailable"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});
