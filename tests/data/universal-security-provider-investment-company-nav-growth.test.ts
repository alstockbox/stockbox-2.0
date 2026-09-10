import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeOperatingCompany: vi.fn(),
  fetchConfiguredMarketData: vi.fn(),
  fetchOfficialInvestmentCompanyNav: vi.fn(),
  fetchOfficialInvestmentCompanyHoldings: vi.fn(),
  fetchYahooLongHistory: vi.fn(),
  fetchOfficialInvestmentCompanyKeyRatios: vi.fn(),
  fetchOfficialInvestmentCompanyGovernance: vi.fn(),
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

vi.mock("@/lib/data/official-investment-company-key-ratios", () => ({
  fetchOfficialInvestmentCompanyKeyRatios: mocks.fetchOfficialInvestmentCompanyKeyRatios,
}));

vi.mock("@/lib/data/official-investment-company-governance", () => ({
  fetchOfficialInvestmentCompanyGovernance: mocks.fetchOfficialInvestmentCompanyGovernance,
}));

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-06T18:00:00.000Z";

function coreReport(): UniversalSecurityReport {
  return {
    ticker: "LATO-B.ST",
    companyName: "Investment AB Latour",
    analysisArchetype: "holding_company",
    recommendation: "No Rating",
    dataCoverage: 0,
    sources: [],
    providerDiagnostics: [],
    score: {
      score: null,
      personalizedScore: null,
      confidence: 60,
      dimensions: [],
      missingData: [],
    },
    market: {
      ticker: "LATO-B.ST",
      price: 150,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 300_000_000_000,
      sharesOutstanding: 2_000_000_000,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
    engine: {
      metrics: {
        latestPeriod: {
          cashAndEquivalents: 5_000_000_000,
          totalDebt: 10_000_000_000,
        },
      },
    },
  } as unknown as UniversalSecurityReport;
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

function officialNav(navAsOf: string, history: Array<{ date: string; navPerShare: number }>) {
  return {
    ok: true as const,
    data: {
      reportedNav: 360_000_000_000,
      reportedNavPerShare: history.find((item) => item.date === navAsOf)?.navPerShare ?? 180,
      navAsOf,
      navPerShareHistory: history,
      annualNavPerShareHistory: [],
      historySource: null,
      source: {
        name: "Latour official NAV disclosure",
        url: "https://www.latour.se/sv/investerare/substansvarde",
        accessedAt: observedAt,
        freshness: "official fixture",
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

describe("investment-company NAV growth production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({ ok: true, data: report, sources: [], warnings: [] });
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(unavailable("Official investment-company holdings"));
    mocks.fetchYahooLongHistory.mockResolvedValue(null);
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(unavailable("Official investment-company key ratios"));
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(unavailable("Official investment-company governance"));
  });

  it("uses verified fresh NAV/share history to make the 3Y NAV-growth factor available", async () => {
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValueOnce(officialNav("2026-06-30", [
      { date: "2023-06-30", navPerShare: 120 },
      { date: "2024-06-30", navPerShare: 135 },
      { date: "2025-06-30", navPerShare: 150 },
      { date: "2026-06-30", navPerShare: 180 },
    ]));

    const result = await analyzeCompany({
      company: { ticker: "LATO-B.ST", name: "Investment AB Latour", securityType: "Common Stock" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const analysis = (result.data as UniversalSecurityReport).securityAnalysis?.investmentCompany;
    const navGrowth = analysis?.score.factors.find((factor) => factor.key === "nav_growth");
    const expected3yCagr = (180 / 120) ** (1 / 3) - 1;

    expect(navGrowth?.status).toBe("available");
    expect(navGrowth?.value).toBeCloseTo(expected3yCagr, 10);
    expect((result.data as UniversalSecurityReport).recommendation).toBe("No Rating");
  });

  it("does not count NAV/share history when its current NAV anchor is stale versus the market price", async () => {
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValueOnce(officialNav("2026-05-07", [
      { date: "2023-05-07", navPerShare: 120 },
      { date: "2026-05-07", navPerShare: 180 },
    ]));

    const result = await analyzeCompany({
      company: { ticker: "LATO-B.ST", name: "Investment AB Latour", securityType: "Common Stock" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const analysis = (result.data as UniversalSecurityReport).securityAnalysis?.investmentCompany;
    const navGrowth = analysis?.score.factors.find((factor) => factor.key === "nav_growth");

    expect(navGrowth?.status).toBe("missing");
    expect(navGrowth?.value).toBeNull();
    expect((result.data as UniversalSecurityReport).recommendation).toBe("No Rating");
  });
});
