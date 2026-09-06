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

vi.mock("@/lib/data/official-investment-company-key-ratios", () => ({
  fetchOfficialInvestmentCompanyKeyRatios: mocks.fetchOfficialInvestmentCompanyKeyRatios,
}));

vi.mock("@/lib/data/official-investment-company-governance", () => ({
  fetchOfficialInvestmentCompanyGovernance: mocks.fetchOfficialInvestmentCompanyGovernance,
}));

vi.mock("@/lib/data/yahoo-etf-holding-fundamentals", () => ({
  fetchYahooEtfHoldingFundamentals: mocks.fetchYahooEtfHoldingFundamentals,
}));

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-06T23:00:00.000Z";
const company = {
  ticker: "INDU-C.ST",
  name: "AB Industrivärden",
  securityType: "Common Stock" as const,
};

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    ticker: company.ticker,
    companyName: company.name,
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
      ticker: company.ticker,
      price: 420,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 181_440_000_000,
      sharesOutstanding: 432_000_000,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
    engine: {
      metrics: {
        latestPeriod: {
          cashAndEquivalents: 2_000_000_000,
          totalDebt: 8_000_000_000,
        },
      },
    },
  } as unknown as UniversalSecurityReport;
}

function officialNavSuccess() {
  return {
    ok: true as const,
    data: {
      reportedNav: 190_080_000_000,
      reportedNavPerShare: 440,
      navAsOf: "2026-06-30",
      navPerShareHistory: [
        { date: "2023-06-30", navPerShare: 300 },
        { date: "2024-06-30", navPerShare: 340 },
        { date: "2025-06-30", navPerShare: 390 },
        { date: "2026-06-30", navPerShare: 440 },
      ],
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

function officialHoldingsSuccess() {
  return {
    ok: true as const,
    data: {
      holdings: [
        { name: "Sandvik", reportedWeight: 0.5, weight: 0.5 },
        { name: "Volvo", reportedWeight: 0.5, weight: 0.5 },
      ],
      rawWeightSum: 1,
      asOf: "2026-06-30",
      source: {
        name: "Industrivärden official portfolio",
        url: "https://www.industrivarden.se/en-gb/operations/portfolio/ownership-and-development/",
        accessedAt: observedAt,
        freshness: "official fixture",
        provider: "official-investment-company-holdings",
        capability: "specialized" as const,
        dataAsOf: "2026-06-30",
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

function yahooLongHistorySuccess() {
  return {
    ok: true as const,
    data: {
      quoteCurrency: "SEK",
      priceHistory: [],
      adjustedPriceHistory: [
        { date: "2021-09-01", adjustedClose: 220, currency: "SEK", provider: "yahoo-long-history" },
        { date: "2023-09-01", adjustedClose: 300, currency: "SEK", provider: "yahoo-long-history" },
        { date: "2026-09-01", adjustedClose: 420, currency: "SEK", provider: "yahoo-long-history" },
      ],
      dividendEvents: [],
      provider: "yahoo-long-history",
    },
    diagnostic: {
      provider: "Yahoo Finance long history",
      capability: "market_data" as const,
      status: "available" as const,
      observedAt,
    },
    source: {
      name: "Yahoo Finance long market history",
      url: "https://finance.yahoo.com/quote/INDU-C.ST/history",
      accessedAt: observedAt,
      freshness: "fixture",
      provider: "yahoo-long-history",
      capability: "market_data" as const,
      dataAsOf: "2026-09-01",
    },
  };
}

function officialKeyRatiosSuccess() {
  const years = [2025, 2024, 2023, 2022, 2021, 2020].map((year) => ({
    year,
    portfolioReturn: 0.12,
    benchmarkReturnSixrx: 0.09,
    netPurchasesSales: 2_000_000_000,
    netDebt: -5_000_000_000,
    debtEquitiesRatio: 0.04,
    navPerShare: 350,
    sharesOutstanding: 432_000_000,
    dividendsPaid: 3_240_000_000,
    dividendPerShare: 7.5,
    dividendsReceived: 6_000_000_000,
  }));
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

function holdingFundamentalsSuccess(ticker: string) {
  return {
    ok: true as const,
    data: {
      revenueGrowth: 0.10,
      epsGrowth: 0.12,
      roic: 0.16,
      operatingMargin: 0.18,
      sector: "Industrials",
      country: "Sweden",
    },
    source: {
      name: "Yahoo Finance holding fundamentals",
      url: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`,
      accessedAt: observedAt,
      freshness: "fixture",
      provider: "Yahoo Finance",
      capability: "specialized" as const,
      version: "yahoo-etf-holding-fundamentals-v2",
    },
    diagnostic: {
      provider: "Yahoo Finance ETF holding fundamentals",
      capability: "specialized" as const,
      status: "available" as const,
      observedAt,
    },
  };
}

describe("investment-company 99% production rating gate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.analyzeOperatingCompany.mockResolvedValue({
      ok: true,
      data: coreHoldingCompanyReport(),
      sources: [],
      warnings: [],
    });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(officialNavSuccess());
    mocks.fetchOfficialInvestmentCompanyHoldings.mockResolvedValue(officialHoldingsSuccess());
    mocks.fetchYahooLongHistory.mockResolvedValue(yahooLongHistorySuccess());
    mocks.fetchOfficialInvestmentCompanyKeyRatios.mockResolvedValue(officialKeyRatiosSuccess());
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValue(officialGovernanceSuccess());
    mocks.searchCompanies.mockImplementation(async (query: string) => {
      if (query === "Sandvik") return [{ ticker: "SAND.ST", canonicalTicker: "SAND.ST", name: "Sandvik AB", securityType: "Common Stock" }];
      if (query === "Volvo") return [{ ticker: "VOLV-B.ST", canonicalTicker: "VOLV-B.ST", name: "AB Volvo", securityType: "Common Stock" }];
      return [];
    });
    mocks.fetchYahooEtfHoldingFundamentals.mockImplementation(async (holding: { ticker?: string }) => holdingFundamentalsSuccess(holding.ticker ?? "UNKNOWN"));
  });

  it("opens the recommendation gate only when all nine specialist factors have verified evidence", async () => {
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const factorStatuses = Object.fromEntries((analysis?.score.factors ?? []).map((factor) => [factor.key, factor.status]));

    expect(factorStatuses).toEqual({
      nav_valuation: "available",
      holdings_quality: "available",
      nav_growth: "available",
      capital_allocation: "available",
      shareholder_returns: "available",
      leverage: "available",
      governance: "available",
      diversification: "available",
      dividend_quality: "available",
    });
    expect(report.dataCoverage).toBeCloseTo(1, 12);
    expect(analysis?.score.score).not.toBeNull();
    expect(report.score.score).toBe(analysis?.score.score);
    expect(report.recommendation).not.toBe("No Rating");
    expect(report.score.missingData.some((message) => /below the 99% verified-data rating gate/i.test(message))).toBe(false);
  });

  it("keeps No Rating at the former 94% ceiling when governance evidence is unavailable", async () => {
    mocks.fetchOfficialInvestmentCompanyGovernance.mockResolvedValueOnce({
      ok: false as const,
      reason: "industrivarden_current_board_roster_mismatch",
      message: "fixture governance unavailable",
      diagnostic: {
        provider: "Official investment-company governance",
        capability: "specialized" as const,
        status: "unavailable" as const,
        reason: "industrivarden_current_board_roster_mismatch",
        observedAt,
      },
    });

    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    expect(analysis?.score.factors.find((factor) => factor.key === "governance")?.status).toBe("missing");
    expect(report.dataCoverage).toBeCloseTo(0.94, 12);
    expect(report.recommendation).toBe("No Rating");
    expect(report.score.missingData.some((message) => /below the 99% verified-data rating gate/i.test(message))).toBe(true);
  });
});
