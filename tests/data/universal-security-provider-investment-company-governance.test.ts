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

const observedAt = "2026-09-06T22:45:00.000Z";
const company = {
  ticker: "INDU-C.ST",
  name: "AB Industrivärden",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "industrivarden-governance-fixture",
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

function officialGovernanceSuccess() {
  return {
    ok: true as const,
    data: {
      directors: [
        { name: "Fredrik Lundberg", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
        { name: "Pär Boman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Christian Caspar", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Marika Fredriksson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Bengt Kjell", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Katarina Martinson", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
        { name: "Fredrik Persson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
        { name: "Lars Pettersson", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
        { name: "Helena Stjernholm", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
      ],
      sources: [
        {
          name: "Industrivärden 2026 Nominating Committee independence statement",
          url: "https://www.industrivarden.se/globalassets/arsstamma/2026/engelska/05b_nominating-committees-proposals-report-and-statement.pdf",
          accessedAt: observedAt,
          freshness: "versioned official governance fixture",
          provider: "official-investment-company-governance",
          version: "official-investment-company-governance-v1",
          capability: "specialized" as const,
        },
        {
          name: "Industrivärden current Board of Directors",
          url: "https://www.industrivarden.se/en-gb/corporate-governance/board-of-directors/board-of-directors/",
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

describe("investment-company governance production wiring", () => {
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
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(officialGovernanceSuccess());
    mocks.searchCompanies.mockResolvedValue([]);
  });

  it("feeds verified official independence evidence into the 6% governance factor with full provenance", async () => {
    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const governance = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "governance",
    );

    expect(mocks.fetchOfficialInvestmentCompanyGovernance).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyGovernance).toHaveBeenCalledWith(company);
    expect(governance?.status).toBe("available");
    expect(governance?.value).toBeCloseTo(77.7777777778, 8);
    expect(governance?.score).toBeCloseTo(77.7777777778, 8);
    expect(report.dataCoverage).toBeCloseTo(0.06, 12);
    expect(report.sources.filter((source) => source.provider === "official-investment-company-governance")).toHaveLength(2);
    expect(result.sources.filter((source) => source.provider === "official-investment-company-governance")).toHaveLength(2);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company governance"
      && item.status === "available"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });

  it("fails closed on live-board roster drift without adding governance coverage or success provenance", async () => {
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValueOnce({
      ok: false as const,
      reason: "industrivarden_current_board_roster_mismatch",
      message: "The current official Industrivärden board roster differs from the verified evidence.",
      diagnostic: {
        provider: "Official investment-company governance",
        capability: "specialized" as const,
        status: "unavailable" as const,
        reason: "industrivarden_current_board_roster_mismatch",
        observedAt,
      },
    });

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const governance = report.securityAnalysis?.investmentCompany?.score.factors.find(
      (factor) => factor.key === "governance",
    );

    expect(mocks.fetchOfficialInvestmentCompanyGovernance).toHaveBeenCalledTimes(1);
    expect(governance?.status).toBe("missing");
    expect(governance?.value).toBeNull();
    expect(report.dataCoverage).toBeCloseTo(0, 12);
    expect(report.sources.some((source) => source.provider === "official-investment-company-governance")).toBe(false);
    expect(result.sources.some((source) => source.provider === "official-investment-company-governance")).toBe(false);
    expect(report.providerDiagnostics?.some((item) => (
      item.provider === "Official investment-company governance"
      && item.status === "unavailable"
      && item.reason === "industrivarden_current_board_roster_mismatch"
    ))).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });
});
