import { describe, expect, it } from "vitest";
import { assessCoverageV3 } from "./coverage-v3";
import type { FinancialAnalysisInput, FinancialAnalysisResult } from "./types";

function corporateFixture(): { input: FinancialAnalysisInput; result: FinancialAnalysisResult } {
  const period = {
    periodEndDate: "2026-06-30",
    currency: "USD",
    revenue: 1_000,
    operatingIncome: 150,
    netIncome: 100,
    operatingCashFlow: 180,
    capitalExpenditures: 30,
    cashAndEquivalents: 250,
    totalDebt: 200,
    totalEquity: 500,
    currentSharesOutstanding: 100,
    provenance: {
      revenue: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
      operatingIncome: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
      netIncome: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
      operatingCashFlow: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
      capitalExpenditures: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
      cashAndEquivalents: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
      totalDebt: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
      totalEquity: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
      currentSharesOutstanding: { source: "SEC filing", valueKind: "reported" as const, periodEnd: "2026-06-30" },
    },
  };

  const input = {
    company: {
      ticker: "TEST",
      name: "Test Company",
      sector: "technology",
      industry: "Software",
      analysisArchetype: "standard",
    },
    annualPeriods: [period],
    market: {
      price: 20,
      priceDate: "2026-09-05",
      marketCap: 2_000,
      marketCapAsOf: "2026-09-05",
      marketCapCurrency: "USD",
      sharesOutstanding: 100,
      sharesOutstandingAsOf: "2026-09-05",
      provider: "market-provider",
      currency: "USD",
    },
    analysisDate: "2026-09-05T12:00:00.000Z",
  } as unknown as FinancialAnalysisInput;

  const result = {
    dataStatus: "current",
    analysisArchetype: "standard",
    metrics: {
      latestPeriod: period,
      cashFlow: { simpleFreeCashFlow: 150 },
      valuation: { marketCap: 2_000 },
      ratios: { returnOnEquity: 0.2 },
      provenance: {
        freeCashFlow: {
          source: "StockBox deterministic calculation",
          valueKind: "derived",
          inputs: ["operatingCashFlow", "capitalExpenditures"],
          periodEnd: "2026-06-30",
        },
      },
    },
    sourceConflicts: [],
    diagnostics: { providerDiagnostics: [] },
  } as unknown as FinancialAnalysisResult;

  return { input, result };
}

describe("assessCoverageV3", () => {
  it("reaches full required coverage when all standard datapoints are verified", () => {
    const { input, result } = corporateFixture();
    const assessment = assessCoverageV3(input, result);

    expect(assessment.profileId).toBe("standard");
    expect(assessment.verifiedCoverage).toBe(1);
    expect(assessment.retrievalCoverage).toBe(1);
    expect(assessment.stockboxFailureCount).toBe(0);
    expect(assessment.recommendationEligible).toBe(true);
  });

  it("does not blame the company for a StockBox retrieval failure", () => {
    const { input, result } = corporateFixture();
    result.metrics.latestPeriod!.revenue = null;
    result.diagnostics.providerDiagnostics = [
      {
        provider: "fundamentals-provider",
        capability: "fundamentals",
        status: "unavailable",
        reason: "network timeout while retrieving issuer fundamentals",
        observedAt: "2026-09-05T12:00:00.000Z",
      },
    ];

    const assessment = assessCoverageV3(input, result);
    const revenue = assessment.dataPoints.find((point) => point.key === "revenue");

    expect(revenue?.status).toBe("STOCKBOX_RETRIEVAL_FAILURE");
    expect(revenue?.companyQualityImpact).toBe("none");
    expect(assessment.fairness.stockboxFailuresPenalizeCompanyQuality).toBe(false);
    expect(assessment.recommendationEligible).toBe(false);
  });

  it("only marks company non-reporting when upstream evidence explicitly proves it", () => {
    const { input, result } = corporateFixture();
    result.metrics.latestPeriod!.totalDebt = null;

    const withoutEvidence = assessCoverageV3(input, result);
    expect(withoutEvidence.dataPoints.find((point) => point.key === "totalDebt")?.status).toBe("SOURCE_UNAVAILABLE");

    const withEvidence = assessCoverageV3(input, result, {
      evidence: {
        totalDebt: {
          status: "NOT_REPORTED_BY_COMPANY",
          reason: "Verified annual filing contains no debt disclosure applicable to this profile.",
          source: "Annual report",
          confidence: 100,
          sourcePriority: 1,
        },
      },
    });

    const debt = withEvidence.dataPoints.find((point) => point.key === "totalDebt");
    expect(debt?.status).toBe("NOT_REPORTED_BY_COMPANY");
    expect(debt?.companyQualityImpact).toBe("disclosure_concern");
    expect(withEvidence.retrievalCoverage).toBe(1);
    expect(withEvidence.disclosureCoverage).toBeLessThan(1);
  });

  it("blocks a critical datapoint when sources conflict", () => {
    const { input, result } = corporateFixture();
    result.sourceConflicts = [
      {
        metric: "revenue",
        periodEnd: "2026-06-30",
        primaryProvider: "SEC",
        secondaryProvider: "secondary",
        primaryValue: 1_000,
        secondaryValue: 1_400,
        relativeDifference: 0.4,
        severity: "high",
        reason: "same period disagreement",
        resolved: false,
      },
    ];

    const assessment = assessCoverageV3(input, result);
    expect(assessment.dataPoints.find((point) => point.key === "revenue")?.status).toBe("DATA_CONFLICT");
    expect(assessment.conflictCount).toBe(1);
    expect(assessment.recommendationEligible).toBe(false);
  });

  it("uses a bank profile rather than generic corporate metrics", () => {
    const { input, result } = corporateFixture();
    input.company.analysisArchetype = "bank";
    result.analysisArchetype = "bank";
    input.specialized = {
      kind: "bank",
      netInterestMargin: { value: 0.031 },
      cet1CapitalRatio: { value: 0.17 },
      grossLoans: { value: 10_000 },
      deposits: { value: 11_000 },
      depositGrowth: { value: 0.05 },
      netInterestIncomeGrowth: { value: 0.04 },
      grossLoanGrowth: { value: 0.03 },
      fundingCost: { value: 0.02 },
      tangibleCommonEquity: { value: 1_000 },
      tangibleBookValuePerShare: { value: 10 },
      nonPerformingLoans: { value: 100 },
      netChargeOffs: { value: 20 },
      loanLossProvisions: { value: 30 },
      efficiencyRatio: { value: 0.5 },
      returnOnAssets: { value: 0.012 },
      returnOnEquity: { value: 0.12 },
      returnOnTangibleCommonEquity: { value: 0.14 },
    };

    const assessment = assessCoverageV3(input, result);
    expect(assessment.profileId).toBe("bank");
    expect(assessment.dataPoints.some((point) => point.key === "cet1CapitalRatio")).toBe(true);
    expect(assessment.dataPoints.some((point) => point.key === "revenue")).toBe(false);
  });

  it("tracks SaaS ARR and retention without falsely lowering hard coverage when current ingestion cannot prove reporting", () => {
    const { input, result } = corporateFixture();
    input.company.analysisArchetype = "software_growth";
    result.analysisArchetype = "software_growth";
    result.metrics.latestPeriod!.grossProfit = 800;
    result.metrics.latestPeriod!.stockBasedCompensation = 20;
    result.metrics.latestPeriod!.researchAndDevelopment = 100;

    const assessment = assessCoverageV3(input, result);
    const arr = assessment.dataPoints.find((point) => point.key === "arr");
    const retention = assessment.dataPoints.find((point) => point.key === "retention");

    expect(arr?.requiredWhenReported).toBe(true);
    expect(arr?.countsTowardCoverage).toBe(false);
    expect(retention?.countsTowardCoverage).toBe(false);
  });
});
