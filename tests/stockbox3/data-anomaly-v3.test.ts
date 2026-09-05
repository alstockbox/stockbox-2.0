import { describe, expect, it } from "vitest";
import { assessDataAnomaliesV3 } from "@/lib/analysis/data-anomaly-v3";
import type { FinancialAnalysisInput, FinancialAnalysisResult } from "@/lib/analysis/types";

function fixture(): { input: FinancialAnalysisInput; result: FinancialAnalysisResult } {
  const period = {
    periodEndDate: "2026-06-30",
    balanceSheetDate: "2026-06-30",
    currency: "USD",
    revenue: 1_000,
    operatingIncome: 150,
    netIncome: 100,
    operatingCashFlow: 180,
    capitalExpenditures: 30,
    cashAndEquivalents: 250,
    totalDebt: 200,
    totalAssets: 1_000,
    totalLiabilities: 500,
    totalEquity: 500,
    currentSharesOutstanding: 100,
  };

  const input = {
    company: {
      ticker: "TEST",
      canonicalTicker: "TEST",
      name: "Test Company",
      sector: "technology",
      analysisArchetype: "standard",
      entityIdentityConfidence: 95,
      reportingCurrency: "USD",
      tradingCurrency: "USD",
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
    providerDiagnostics: [],
  } as unknown as FinancialAnalysisInput;

  const result = {
    modelVersion: "stockbox-analysis-v2.7-test",
    canonicalInputFingerprint: "fixture",
    analysisArchetype: "standard",
    currencyAlignment: "aligned",
    dataStatus: "current",
    sourceConflicts: [],
    diagnostics: {
      latestFinancialPeriodEnd: "2026-06-30",
      latestAnnualPeriodEnd: "2026-06-30",
      dataAgeDays: 67,
      ttmStatus: "annual_fallback",
      providerDiagnostics: [],
      dataStatus: "current",
      currencyAlignment: "aligned",
    },
  } as unknown as FinancialAnalysisResult;

  return { input, result };
}

describe("Data Anomaly V3", () => {
  it("keeps a clean, reconciled fixture eligible with full integrity", () => {
    const { input, result } = fixture();
    const assessment = assessDataAnomaliesV3(input, result);

    expect(assessment.anomalies).toEqual([]);
    expect(assessment.integrityScore).toBe(100);
    expect(assessment.recommendationIntegrityEligible).toBe(true);
  });

  it("suppresses a primary provider failure when the same capability recovered via fallback", () => {
    const { input, result } = fixture();
    result.diagnostics.providerDiagnostics = [
      {
        provider: "primary",
        capability: "fundamentals",
        status: "unavailable",
        reason: "timeout",
        observedAt: "2026-09-05T12:00:00.000Z",
      },
      {
        provider: "fallback",
        capability: "fundamentals",
        status: "available",
        observedAt: "2026-09-05T12:00:01.000Z",
      },
    ];

    const assessment = assessDataAnomaliesV3(input, result);
    expect(assessment.anomalies.some((item) => item.code === "PROVIDER_RETRIEVAL_FAILURE")).toBe(false);
    expect(assessment.recommendationIntegrityEligible).toBe(true);
  });

  it("blocks an unresolved essential provider failure without blaming company quality", () => {
    const { input, result } = fixture();
    result.diagnostics.providerDiagnostics = [
      {
        provider: "fundamentals-provider",
        capability: "fundamentals",
        status: "unavailable",
        reason: "network timeout",
        observedAt: "2026-09-05T12:00:00.000Z",
      },
    ];

    const assessment = assessDataAnomaliesV3(input, result);
    const providerFailure = assessment.anomalies.find((item) => item.code === "PROVIDER_RETRIEVAL_FAILURE");

    expect(providerFailure?.blockingForRecommendation).toBe(true);
    expect(providerFailure?.companyQualityImpact).toBe("none");
    expect(assessment.fairness.systemIntegrityAnomaliesPenalizeCompanyQuality).toBe(false);
    expect(assessment.recommendationIntegrityEligible).toBe(false);
  });

  it("hard-blocks unresolved source conflicts", () => {
    const { input, result } = fixture();
    result.sourceConflicts = [
      {
        metric: "revenue",
        periodEnd: "2026-06-30",
        primaryProvider: "SEC",
        secondaryProvider: "secondary",
        relativeDifference: 0.4,
        severity: "high",
        reason: "same-period disagreement",
        resolved: false,
      },
    ];

    const assessment = assessDataAnomaliesV3(input, result);
    const conflict = assessment.anomalies.find((item) => item.code === "UNRESOLVED_SOURCE_CONFLICT");

    expect(conflict?.severity).toBe("critical");
    expect(conflict?.blockingForRecommendation).toBe(true);
    expect(assessment.recommendationIntegrityEligible).toBe(false);
  });

  it("blocks financial dates materially after the analysis timestamp", () => {
    const { input, result } = fixture();
    input.annualPeriods[0]!.periodEndDate = "2026-09-20";

    const assessment = assessDataAnomaliesV3(input, result);
    expect(assessment.anomalies.some((item) => item.code === "FUTURE_DATED_FINANCIAL" && item.blockingForRecommendation)).toBe(true);
  });

  it("blocks low entity identity confidence before a directional assessment", () => {
    const { input, result } = fixture();
    input.company.entityIdentityConfidence = 35;

    const assessment = assessDataAnomaliesV3(input, result);
    const identity = assessment.anomalies.find((item) => item.code === "ENTITY_IDENTITY_UNCERTAIN");

    expect(identity?.blockingForRecommendation).toBe(true);
    expect(identity?.companyQualityImpact).toBe("none");
  });

  it("surfaces balance-sheet identity mismatches as reconciliation warnings, not standalone company penalties", () => {
    const { input, result } = fixture();
    input.annualPeriods[0]!.totalAssets = 1_500;

    const assessment = assessDataAnomaliesV3(input, result);
    const mismatch = assessment.anomalies.find((item) => item.code === "BALANCE_SHEET_IDENTITY_MISMATCH");

    expect(mismatch?.severity).toBe("high");
    expect(mismatch?.blockingForRecommendation).toBe(false);
    expect(mismatch?.companyQualityImpact).toBe("none");
    expect(assessment.recommendationIntegrityEligible).toBe(true);
  });

  it("only checks market-cap/share-basis consistency when dates and currencies are comparable", () => {
    const { input, result } = fixture();
    input.market!.marketCap = 5_000;

    const comparable = assessDataAnomaliesV3(input, result);
    expect(comparable.anomalies.some((item) => item.code === "MARKET_CAP_SHARE_BASIS_MISMATCH")).toBe(true);

    input.market!.marketCapCurrency = "EUR";
    const currencyMismatch = assessDataAnomaliesV3(input, result);
    expect(currencyMismatch.anomalies.some((item) => item.code === "MARKET_CAP_SHARE_BASIS_MISMATCH")).toBe(false);
  });

  it("treats stale and currency-misaligned canonical data as integrity blockers", () => {
    const { input, result } = fixture();
    result.dataStatus = "stale";
    result.currencyAlignment = "mismatch";

    const assessment = assessDataAnomaliesV3(input, result);
    expect(assessment.anomalies.some((item) => item.code === "STALE_FINANCIAL_DATA")).toBe(true);
    expect(assessment.anomalies.some((item) => item.code === "FINANCIAL_CURRENCY_MISMATCH")).toBe(true);
    expect(assessment.counts.blocking).toBeGreaterThanOrEqual(2);
    expect(assessment.recommendationIntegrityEligible).toBe(false);
  });

  it("fails closed on NaN or infinite canonical inputs", () => {
    const { input, result } = fixture();
    input.annualPeriods[0]!.revenue = Number.NaN;
    input.market!.price = Number.POSITIVE_INFINITY;

    const assessment = assessDataAnomaliesV3(input, result);
    const nonfinite = assessment.anomalies.filter((item) => item.code === "NONFINITE_INPUT");

    expect(nonfinite).toHaveLength(2);
    expect(nonfinite.every((item) => item.blockingForRecommendation)).toBe(true);
    expect(assessment.recommendationIntegrityEligible).toBe(false);
  });
});
