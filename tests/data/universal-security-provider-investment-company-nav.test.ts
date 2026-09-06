import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  analyzeOperatingCompany: vi.fn(),
  fetchConfiguredMarketData: vi.fn(),
  fetchOfficialInvestmentCompanyNav: vi.fn(),
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

import { analyzeCompany, type UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const observedAt = "2026-09-06T18:00:00.000Z";

function coreHoldingCompanyReport(): UniversalSecurityReport {
  return {
    id: "holding-fixture",
    ticker: "INVE-B.ST",
    companyName: "Investor AB",
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
    dcf: {
      suitable: false,
      reason: "fixture",
      bear: null,
      base: null,
      bull: null,
    },
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
      price: 150,
      currency: "SEK",
      date: "2026-09-05",
      volume: null,
      marketCap: 450_000_000_000,
      sharesOutstanding: 3_000_000_000,
      performance: { "1D": null, "1W": null, "1M": null, "3M": null, "6M": null, "YTD": null, "1Y": null, "3Y": null, "5Y": null },
    },
    engine: {
      metrics: {
        latestPeriod: {
          fiscalYear: 2025,
          periodEndDate: "2025-12-31",
          cashAndEquivalents: 10_000_000_000,
          totalDebt: 20_000_000_000,
        },
      },
    } as UniversalSecurityReport["engine"],
  };
}

describe("investment-company official NAV production wiring", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const report = coreHoldingCompanyReport();
    mocks.analyzeOperatingCompany.mockResolvedValue({
      ok: true,
      data: report,
      sources: report.sources,
      warnings: [],
    });
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue({
      ok: true,
      data: {
        reportedNav: 600_000_000_000,
        reportedNavPerShare: 200,
        navAsOf: "2026-09-05",
        source: {
          name: "Investor AB official NAV disclosure",
          url: "https://example.com/investor-nav",
          accessedAt: observedAt,
          freshness: "official fixture",
          provider: "official-investment-company-nav",
          capability: "specialized",
          dataAsOf: "2026-09-05",
          version: "official-investment-company-nav-v2",
        },
        diagnostic: {
          provider: "Official investment-company NAV",
          capability: "specialized",
          status: "available",
          observedAt,
        },
      },
    });
  });

  it("uses verified official NAV/share in the investment-company model and preserves the 99% No Rating gate", async () => {
    const company = {
      ticker: "INVE-B.ST",
      name: "Investor AB",
      securityType: "Common Stock" as const,
    };

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.data as UniversalSecurityReport;
    const analysis = report.securityAnalysis?.investmentCompany;
    const navFactor = analysis?.score.factors.find((factor) => factor.key === "nav_valuation");

    expect(mocks.fetchOfficialInvestmentCompanyNav).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOfficialInvestmentCompanyNav).toHaveBeenCalledWith(company);
    expect(analysis?.nav.source).toBe("reported_nav_per_share");
    expect(analysis?.nav.perShare).toBe(200);
    expect(analysis?.nav.discountPremium).toBeCloseTo(-0.25, 8);
    expect(navFactor?.status).toBe("available");
    expect(report.sources.some((source) => source.provider === "official-investment-company-nav")).toBe(true);
    expect(report.providerDiagnostics?.some((item) => item.provider === "Official investment-company NAV" && item.status === "available")).toBe(true);
    expect(report.dataCoverage).toBeLessThan(0.99);
    expect(report.recommendation).toBe("No Rating");
  });
});
