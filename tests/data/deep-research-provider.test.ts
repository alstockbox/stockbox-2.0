import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyFundamentals } from "../../src/lib/analysis";
import { durableCompounderInput } from "../analysis/fixtures";
import { providerDiagnostic } from "../../src/lib/data/providers";

const mocks = vi.hoisted(() => ({
  fetchCompanyFundamentalsResult: vi.fn(),
  fetchSecSubmissionEvents: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  getMarketDataProvider: vi.fn(() => "disabled"),
  isFinancialProviderConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/data/sec", () => ({ fetchCompanyFundamentalsResult: mocks.fetchCompanyFundamentalsResult }));
vi.mock("@/lib/data/sec-submissions", () => ({ fetchSecSubmissionEvents: mocks.fetchSecSubmissionEvents }));

import { analyzeCompany } from "../../src/lib/data/provider";

const fundamentals: CompanyFundamentals = {
  ticker: "BOX",
  name: "Box Systems",
  cik: "0000000123",
  sector: "technology",
  industry: "software",
  annual: durableCompounderInput.annualPeriods.map((period) => ({
    fiscalYear: period.fiscalYear!,
    revenue: period.revenue ?? null,
    grossProfit: period.grossProfit ?? null,
    operatingIncome: period.operatingIncome ?? null,
    netIncome: period.netIncome ?? null,
    epsDiluted: period.epsDiluted ?? null,
    operatingCashFlow: period.operatingCashFlow ?? null,
    capex: period.capitalExpenditures ?? null,
    assets: period.totalAssets ?? null,
    liabilities: period.totalLiabilities ?? null,
    cash: period.cashAndEquivalents ?? null,
    debt: period.totalDebt ?? null,
    equity: period.totalEquity ?? null,
    interestExpense: period.interestExpense ?? null,
  })),
};

const request = {
  company: { ticker: "BOX", canonicalTicker: "BOX", name: "Box Systems", cik: "0000000123", country: "US" },
  investmentProfile: "balanced" as const,
};

describe("deep research provider orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchCompanyFundamentalsResult.mockResolvedValue({
      ok: true,
      data: fundamentals,
      diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "available"),
    });
    mocks.fetchSecSubmissionEvents.mockResolvedValue({
      ok: true,
      data: {
        data: [{
          category: "earnings_results",
          form: "10-Q",
          filingDate: "2026-08-01",
          accession: "0000000123-26-000001",
          primaryDocument: "quarterly.htm",
          url: "https://www.sec.gov/Archives/edgar/data/123/000000012326000001/quarterly.htm",
          items: [],
          source: "SEC EDGAR submissions metadata",
          provider: "sec-submissions",
        }],
        dataAsOf: "2026-08-01",
        coverage: 1,
        confidence: 95,
        evidence: [{
          id: "sec-submissions-0000000123",
          kind: "reported_fact",
          sourceTier: "regulatory_filing",
          title: "SEC submissions metadata",
          source: { name: "SEC EDGAR submissions", url: "https://data.sec.gov/submissions/CIK0000000123.json", accessedAt: "2026-08-23", freshness: "current" },
          dataAsOf: "2026-08-01",
        }],
      },
      diagnostic: providerDiagnostic("SEC Submissions", "filings_events", "available"),
    });
  });

  it("does not perform additional SEC submissions retrieval for Summary", async () => {
    const result = await analyzeCompany({ ...request, analysisType: "summary" });
    expect(result.ok).toBe(true);
    expect(mocks.fetchSecSubmissionEvents).not.toHaveBeenCalled();
    if (result.ok) expect(result.data.research).toBeUndefined();
  });

  it("retrieves filings for Deep and exposes event evidence and coverage", async () => {
    const result = await analyzeCompany({ ...request, analysisType: "deep" });
    expect(result.ok).toBe(true);
    expect(mocks.fetchSecSubmissionEvents).toHaveBeenCalledOnce();
    if (result.ok) {
      expect(result.data.research?.events).toEqual([
        expect.objectContaining({ form: "10-Q", category: "earnings_results" }),
      ]);
      expect(result.data.research?.layers.find((layer) => layer.layer === "filings_events")).toEqual(expect.objectContaining({
        status: "available",
        coverage: 1,
        confidence: 95,
      }));
      expect(result.data.research?.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "sec-submissions-0000000123", sourceTier: "regulatory_filing" }),
      ]));
      expect(result.data.research?.layers.find((layer) => layer.layer === "news_events")?.status).toBe("unavailable");
      expect(result.data.research?.coverage).toBeLessThan(1);
      expect(result.data.research?.confidence).toBeLessThan(95);
    }
  });
});
