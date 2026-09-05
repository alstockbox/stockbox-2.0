import { describe, expect, it, vi } from "vitest";
import {
  evaluateRecommendationV3Shadow,
  runRecommendationV3Shadow,
} from "@/lib/analysis/recommendation-v3-shadow";
import type {
  FinancialAnalysisInput,
  FinancialAnalysisResult,
  ScoreDimension,
  ScoreDimensionKey,
  ScoreResult,
} from "@/lib/analysis/types";

const dimensionKeys: ScoreDimensionKey[] = [
  "growth",
  "profitability",
  "financialHealth",
  "valuation",
  "cashFlow",
  "earningsQuality",
  "quality",
  "momentum",
  "risk",
];

function fixture(): { input: FinancialAnalysisInput; result: FinancialAnalysisResult } {
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

  const dimensions = Object.fromEntries(
    dimensionKeys.map((key) => [
      key,
      {
        key,
        label: key,
        score: key === "valuation" ? 90 : key === "risk" ? 70 : 80,
        weight: key === "valuation" ? 0.2 : 0.1,
        coverage: 1,
        contributors: [],
      } satisfies ScoreDimension,
    ]),
  ) as unknown as Record<ScoreDimensionKey, ScoreDimension>;

  const scores = {
    stockBoxScore: 86,
    personalizedScore: 97,
    investmentProfile: "balanced",
    sector: "technology",
    analysisArchetype: "standard",
    confidence: 90,
    confidenceBreakdown: {} as ScoreResult["confidenceBreakdown"],
    dataCoverage: 1,
    dimensions,
    shortTermScore: 75,
    longTermScore: 90,
  } as ScoreResult;

  const input = {
    company: {
      ticker: "TEST",
      canonicalTicker: "TEST",
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
    modelVersion: "stockbox-analysis-v2.7-test",
    canonicalInputFingerprint: "fixture-fingerprint",
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
    scores,
    redFlags: [],
    recommendation: { rating: "Strong Buy" },
    dcf: { status: "available", impliedUpside: 0.3, low: 18, mid: 26, high: 32 },
    sourceConflicts: [],
    diagnostics: { providerDiagnostics: [] },
  } as unknown as FinancialAnalysisResult;

  return { input, result };
}

describe("Recommendation V3 shadow mode", () => {
  it("does zero shadow work when the feature flag is disabled", () => {
    const { input, result } = fixture();
    const emit = vi.fn();

    const shadow = runRecommendationV3Shadow(input, result, { enabled: false, killed: false, emit });

    expect(shadow).toEqual({ status: "disabled" });
    expect(emit).not.toHaveBeenCalled();
  });

  it("obeys the emergency kill switch before evaluation", () => {
    const { input, result } = fixture();
    const emit = vi.fn();

    const shadow = runRecommendationV3Shadow(input, result, { enabled: true, killed: true, emit });

    expect(shadow).toEqual({ status: "killed" });
    expect(emit).not.toHaveBeenCalled();
  });

  it("evaluates exact Coverage V3 and emits only privacy-minimized comparison telemetry", () => {
    const { input, result } = fixture();
    const emit = vi.fn();
    const beforeInput = JSON.stringify(input);
    const beforeResult = JSON.stringify(result);

    const shadow = runRecommendationV3Shadow(input, result, {
      enabled: true,
      killed: false,
      now: () => "2026-09-05T13:00:00.000Z",
      emit,
    });

    expect(shadow.status).toBe("evaluated");
    if (shadow.status !== "evaluated") throw new Error("Expected evaluated shadow result");
    expect(shadow.coverage.verifiedCoverage).toBe(1);
    expect(shadow.decision.rating).toBe("STRONG_BUY");
    expect(shadow.event.normalizedLegacyRating).toBe("STRONG_BUY");
    expect(shadow.event.changed).toBe(false);
    expect(shadow.event.hadPersonalizedScore).toBe(true);
    expect(shadow.event).not.toHaveProperty("userMatchScore");
    expect(JSON.stringify(shadow.event)).not.toContain("97");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(input)).toBe(beforeInput);
    expect(JSON.stringify(result)).toBe(beforeResult);
  });

  it("never lets a telemetry sink failure fail or mutate the canonical result", () => {
    const { input, result } = fixture();
    const before = JSON.stringify(result);

    const shadow = runRecommendationV3Shadow(input, result, {
      enabled: true,
      killed: false,
      emit: () => {
        throw new Error("telemetry unavailable");
      },
    });

    expect(shadow.status).toBe("evaluated");
    if (shadow.status === "evaluated") expect(shadow.emitted).toBe(false);
    expect(JSON.stringify(result)).toBe(before);
  });

  it("fails open when V3 evaluation itself encounters an invalid shadow-only shape", () => {
    const { input, result } = fixture();
    const invalid = { ...result, scores: undefined } as unknown as FinancialAnalysisResult;
    const before = JSON.stringify(result);

    const shadow = runRecommendationV3Shadow(input, invalid, {
      enabled: true,
      killed: false,
      emit: vi.fn(),
    });

    expect(shadow.status).toBe("failed");
    expect(JSON.stringify(result)).toBe(before);
  });

  it("marks a disagreement without changing the legacy recommendation", () => {
    const { input, result } = fixture();
    result.scores.stockBoxScore = 48;
    result.recommendation.rating = "Strong Buy";
    const legacyBefore = result.recommendation.rating;

    const evaluated = evaluateRecommendationV3Shadow(input, result, "2026-09-05T13:00:00.000Z");

    expect(evaluated.event.changed).toBe(true);
    expect(evaluated.event.v3Rating).toBe("WAIT");
    expect(result.recommendation.rating).toBe(legacyBefore);
  });
});
