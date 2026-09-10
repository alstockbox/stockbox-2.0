import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeOperatingCompany: vi.fn(),
  fetchConfiguredMarketData: vi.fn(),
  fetchOfficialInvestmentCompanyNav: vi.fn(),
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

vi.mock("@/lib/data/yahoo-long-history", () => ({
  fetchYahooLongHistory: mocks.fetchYahooLongHistory,
}));

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

function coreReport(archetype = "holding_company"): UniversalSecurityReport {
  return {
    ticker: "LATO-B.ST",
    companyName: "Investment AB Latour",
    analysisArchetype: archetype,
    recommendation: "No Rating",
    dataCoverage: 0,
    sources: [],
    providerDiagnostics: [],
    score: { score: null, personalizedScore: null, confidence: 60, dimensions: [], missingData: [] },
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
    engine: { metrics: { latestPeriod: { cashAndEquivalents: 5_000_000_000, totalDebt: 10_000_000_000 } } },
  } as unknown as UniversalSecurityReport;
}

function officialNavSuccess() {
  return {
    ok: true as const,
    data: {
      reportedNav: 360_000_000_000,
      reportedNavPerShare: 180,
      navAsOf: "2026-06-30",
      navPerShareHistory: [
        { date: "2023-06-30", navPerShare: 120 },
        { date: "2026-06-30", navPerShare: 180 },
      ],
      source: {
        name: "Latour official NAV disclosure",
        url: "https://www.latour.se/sv/investerare/substansvarde",
        accessedAt: "2026-09-06T18:00:00.000Z",
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
        observedAt: "2026-09-06T18:00:00.000Z",
      },
    },
  };
}

function yahooSuccess(adjustedPriceHistory: Array<{ date: string; adjustedClose: number }>) {
  return {
    ok: true as const,
    data: {
      quoteCurrency: "SEK",
      priceHistory: [
        { date: "2021-09-01", close: 100, currency: "SEK", provider: "yahoo-long-history" },
        { date: "2023-09-01", close: 120, currency: "SEK", provider: "yahoo-long-history" },
        { date: "2026-09-01", close: 180, currency: "SEK", provider: "yahoo-long-history" },
      ],
      adjustedPriceHistory: adjustedPriceHistory.map((item) => ({ ...item, currency: "SEK", provider: "yahoo-long-history" })),
      dividendEvents: [],
      provider: "yahoo-long-history",
    },
    diagnostic: {
      provider: "Yahoo Finance long history",
      capability: "market_data" as const,
      status: "available" as const,
      observedAt: "2026-09-06T18:00:00.000Z",
    },
    source: {
      name: "Yahoo Finance long market history",
      url: "https://finance.yahoo.com/quote/LATO-B.ST/history",
      accessedAt: "2026-09-06T18:00:00.000Z",
      freshness: "fixture",
      provider: "yahoo-long-history",
      capability: "market_data" as const,
      dataAsOf: "2026-09-01",
    },
  };
}

describe("investment-company shareholder-return production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({ ok: true, data: report, sources: [], warnings: [] });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(officialNavSuccess());
  });

  it("uses adjusted close to make long-run shareholder return available and prefers 5Y CAGR", async () => {
    mocks.fetchYahooLongHistory.mockResolvedValueOnce(yahooSuccess([
      { date: "2021-09-01", adjustedClose: 100 },
      { date: "2023-09-01", adjustedClose: 120 },
      { date: "2026-09-01", adjustedClose: 180 },
    ]));

    const company = { ticker: "LATO-B.ST", name: "Investment AB Latour", securityType: "Common Stock" as const };
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as UniversalSecurityReport;
    const factor = report.securityAnalysis?.investmentCompany?.score.factors.find((item) => item.key === "shareholder_returns");

    expect(mocks.fetchYahooLongHistory).toHaveBeenCalledTimes(1);
    expect(mocks.fetchYahooLongHistory).toHaveBeenCalledWith(company);
    expect(factor?.status).toBe("available");
    expect(factor?.value).toBeCloseTo((180 / 100) ** (1 / 5) - 1, 10);
    expect(report.sources.some((source) => source.provider === "yahoo-long-history")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => item.provider === "Yahoo Finance long history")).toBe(true);
    expect(report.recommendation).toBe("No Rating");
  });

  it("does not substitute raw close when adjusted-close history is unavailable", async () => {
    mocks.fetchYahooLongHistory.mockResolvedValueOnce(yahooSuccess([]));

    const result = await analyzeCompany({
      company: { ticker: "LATO-B.ST", name: "Investment AB Latour", securityType: "Common Stock" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as UniversalSecurityReport;
    const factor = report.securityAnalysis?.investmentCompany?.score.factors.find((item) => item.key === "shareholder_returns");

    expect(factor?.status).toBe("missing");
    expect(factor?.value).toBeNull();
    expect(report.recommendation).toBe("No Rating");
  });

  it("does not fetch specialist long history for an operating company", async () => {
    const report = coreReport("standard");
    mocks.analyzeOperatingCompany.mockResolvedValueOnce({ ok: true, data: report, sources: [], warnings: [] });

    const result = await analyzeCompany({
      company: { ticker: "OPER", name: "Operating Company", securityType: "Common Stock" },
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    expect(mocks.fetchYahooLongHistory).not.toHaveBeenCalled();
  });
});
