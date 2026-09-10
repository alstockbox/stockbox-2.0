import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeInvestmentCompany } from "../../src/lib/analysis/universal-security";
import type { UniversalSecurityReport } from "../../src/lib/data/universal-security-provider";

const mocks = vi.hoisted(() => ({
  analyzeUniversalCompany: vi.fn(),
  searchCompanies: vi.fn(),
  supportsUniversalSecurityAnalysis: vi.fn(),
  fetchOfficialInvestmentCompanyNav: vi.fn(),
}));

vi.mock("../../src/lib/data/universal-security-provider", () => ({
  analyzeCompany: mocks.analyzeUniversalCompany,
  searchCompanies: mocks.searchCompanies,
  supportsUniversalSecurityAnalysis: mocks.supportsUniversalSecurityAnalysis,
}));

vi.mock("../../src/lib/data/official-investment-company-nav", () => ({
  fetchOfficialInvestmentCompanyNav: mocks.fetchOfficialInvestmentCompanyNav,
}));

import { analyzeCompany } from "../../src/lib/data/universal-security-live-provider";

const company = {
  ticker: "TEST.ST",
  canonicalTicker: "TEST.ST",
  name: "Test Investment AB",
  securityType: "Common Stock" as const,
};

function officialNavSuccess() {
  return {
    ok: true as const,
    data: {
      reportedNav: 10_000,
      reportedNavPerShare: 100,
      navAsOf: "2026-06-30",
      source: {
        name: "Official NAV",
        url: "https://example.com/nav",
        accessedAt: "2026-09-07T16:00:00.000Z",
        freshness: "fixture",
        provider: "official-investment-company-nav",
        capability: "specialized" as const,
        dataAsOf: "2026-06-30",
      },
      diagnostic: {
        provider: "Official investment-company NAV",
        capability: "specialized" as const,
        status: "available" as const,
        observedAt: "2026-09-07T16:00:00.000Z",
      },
    },
  };
}

function reportWithFullSpecialistCoverage(): UniversalSecurityReport {
  const specialist = analyzeInvestmentCompany({
    sharePrice: 90,
    dilutedShares: 100,
    reportedNav: 10_000,
    navGrowth5yCagr: 0.11,
    shareholderReturn5yCagr: 0.13,
    capitalAllocationScore: 84,
    managementGovernanceScore: 82,
    dividendQualityScore: 78,
    cash: 200,
    debt: 100,
    holdings: [
      { name: "Holding A", weight: 0.5, stockBoxScore: 86 },
      { name: "Holding B", weight: 0.5, stockBoxScore: 78 },
    ],
  });
  expect(specialist.score.coverage).toBeCloseTo(1, 12);
  expect(specialist.score.score).not.toBeNull();

  return {
    ticker: company.ticker,
    companyName: company.name,
    analysisArchetype: "holding_company",
    recommendation: "Buy",
    dataCoverage: specialist.score.coverage,
    sources: [],
    providerDiagnostics: [],
    summary: "Fully enriched investment-company report.",
    score: {
      score: specialist.score.score,
      personalizedScore: specialist.score.score,
      confidence: 90,
      dimensions: [],
      missingData: [],
    },
    market: {
      ticker: company.ticker,
      price: 90,
      currency: "SEK",
      date: "2026-09-05",
      volume: 100_000,
      marketCap: 9_000,
      sharesOutstanding: 100,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
    securityAnalysis: { investmentCompany: specialist },
  } as unknown as UniversalSecurityReport;
}

function genericReportBeforeNavReroute(): UniversalSecurityReport {
  return {
    ticker: company.ticker,
    companyName: company.name,
    analysisArchetype: "standard",
    recommendation: "Buy",
    dataCoverage: 0.9,
    sources: [],
    providerDiagnostics: [],
    summary: "Generic report before official NAV reroute.",
    score: {
      score: 82,
      personalizedScore: 82,
      confidence: 88,
      dimensions: [],
      missingData: [],
    },
    market: {
      ticker: company.ticker,
      price: 90,
      currency: "SEK",
      date: "2026-09-05",
      volume: 100_000,
      marketCap: 9_000,
      sharesOutstanding: 100,
      yearHigh: null,
      yearLow: null,
      performance: {},
    },
    engine: {
      metrics: {
        latestPeriod: {
          cashAndEquivalents: 200,
          totalDebt: 100,
        },
      },
    },
  } as unknown as UniversalSecurityReport;
}

describe("universal-security live provider investment-company integrity", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.fetchOfficialInvestmentCompanyNav.mockResolvedValue(officialNavSuccess());
  });

  it("preserves an already fully enriched specialist analysis instead of replacing it with NAV-only fallback coverage", async () => {
    const report = reportWithFullSpecialistCoverage();
    const specialist = report.securityAnalysis?.investmentCompany;
    mocks.analyzeUniversalCompany.mockResolvedValue({
      ok: true,
      data: report,
      sources: report.sources,
      warnings: [],
    });

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as UniversalSecurityReport;
    expect(mocks.fetchOfficialInvestmentCompanyNav).not.toHaveBeenCalled();
    expect(data.securityAnalysis?.investmentCompany).toBe(specialist);
    expect(data.dataCoverage).toBeCloseTo(1, 12);
    expect(data.recommendation).not.toBe("No Rating");
  });

  it("clears a stale generic score when official NAV reroutes a company into an insufficient-coverage specialist model", async () => {
    const report = genericReportBeforeNavReroute();
    mocks.analyzeUniversalCompany.mockResolvedValue({
      ok: true,
      data: report,
      sources: report.sources,
      warnings: [],
    });

    const result = await analyzeCompany({
      company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as UniversalSecurityReport;
    expect(data.analysisArchetype).toBe("holding_company");
    expect(data.securityAnalysis?.investmentCompany?.score.score).toBeNull();
    expect(data.dataCoverage).toBeLessThan(0.99);
    expect(data.recommendation).toBe("No Rating");
    expect(data.score.score).toBeNull();
    expect(data.score.personalizedScore).toBeNull();
  });
});