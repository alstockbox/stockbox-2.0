import { describe, expect, it } from "vitest";
import type { RecommendationV3ShadowEvent } from "@/lib/analysis/recommendation-v3-shadow";
import type { UniversalSecurityReport } from "@/lib/data/universal-security-provider";
import { recommendationReviewEventFromAnalysisV3 } from "@/lib/monitoring/recommendation-review-worker-v3";
import {
  createSpecialistRecommendationV3ShadowEvent,
  ETF_SPECIALIST_MODEL_VERSION,
  INVESTMENT_COMPANY_SPECIALIST_MODEL_VERSION,
  SPECIALIST_COVERAGE_V3_POLICY_VERSION,
  SPECIALIST_INTEGRITY_V3_POLICY_VERSION,
  SPECIALIST_RECOMMENDATION_V3_POLICY_VERSION,
} from "@/lib/monitoring/recommendation-specialist-shadow-v3";

function report(overrides: Partial<UniversalSecurityReport> = {}): UniversalSecurityReport {
  return {
    id: "report-1",
    ticker: "ETF1",
    companyName: "Example ETF",
    analysisType: "summary",
    investmentProfile: "balanced",
    generatedAt: "2026-09-09T10:00:00.000Z",
    oneSentence: "ETF",
    summary: "ETF specialist report",
    recommendation: "Buy",
    shortTermAssessment: "short",
    longTermAssessment: "long",
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
    score: { score: 80, personalizedScore: 80, confidence: 90, dimensions: [], missingData: [] },
    dcf: { suitable: false, bear: null, base: null, bull: null },
    redFlags: [],
    greenFlags: [],
    scenarios: [],
    sources: [],
    disclaimer: "test",
    modelVersion: "universal-security-v1",
    reportSchemaVersion: "universal-security-v1",
    dataCoverage: 0.9,
    dataAsOf: "2026-09-09",
    dataStatus: "current",
    providerDiagnostics: [],
    securityClassification: {
      kind: "equity_etf",
      confidence: 1,
      reason: "test",
    },
    securityAnalysis: {
      etf: {
        kind: "etf",
        subtype: "equity_etf",
        score: {
          score: 80,
          coverage: 0.9,
          availableWeight: 90,
          applicableWeight: 100,
          factors: [],
          missing: [],
        },
        lookThrough: {
          coveredWeight: 0,
          qualityCoveredWeight: 0,
          stockBoxQuality: null,
          revenueGrowth: null,
          epsGrowth: null,
          roic: null,
          operatingMargin: null,
          netDebtToEbitda: null,
          forwardPe: null,
          priceBook: null,
          freeCashFlowYield: null,
          dividendYield: null,
          top10Weight: null,
          largestHoldingWeight: null,
          holdingsHhi: null,
          sectorHhi: null,
          countryHhi: null,
        },
        warnings: [],
      },
    },
    ...overrides,
  };
}

describe("Recommendation specialist shadow V3", () => {
  it("creates a native ETF audit without treating the objective specialist score as personalization", () => {
    const event = createSpecialistRecommendationV3ShadowEvent(report(), "2026-09-09T10:05:00.000Z");

    expect(event).not.toBeNull();
    expect(event?.ticker).toBe("ETF1");
    expect(event?.analysisArchetype).toBe("etf:equity_etf");
    expect(event?.objectiveScore).toBe(80);
    expect(event?.v3Rating).toBe("BUY");
    expect(event?.hadPersonalizedScore).toBe(false);
    expect(event?.verifiedCoverage).toBe(0.9);
    expect(event?.coveragePolicyVersion).toBe(SPECIALIST_COVERAGE_V3_POLICY_VERSION);
    expect(event?.anomalyPolicyVersion).toBe(SPECIALIST_INTEGRITY_V3_POLICY_VERSION);
    expect(event?.recommendationPolicyVersion).toBe(SPECIALIST_RECOMMENDATION_V3_POLICY_VERSION);
    expect(event?.modelVersion).toBe(ETF_SPECIALIST_MODEL_VERSION);
  });

  it("keeps missing specialist security identity missing instead of creating a blank audit lineage", () => {
    expect(createSpecialistRecommendationV3ShadowEvent(report({ ticker: "   " }))).toBeNull();
  });

  it("hard-blocks directional output when specialist factor coverage is below the verified minimum", () => {
    const lowCoverage = report({
      securityAnalysis: {
        etf: {
          ...report().securityAnalysis!.etf!,
          score: { ...report().securityAnalysis!.etf!.score, coverage: 0.4 },
        },
      },
    });
    const event = createSpecialistRecommendationV3ShadowEvent(lowCoverage);

    expect(event?.v3Rating).toBe("UNAVAILABLE");
    expect(event?.confidenceGateHardBlocked).toBe(true);
    expect(event?.recommendationEligible).toBe(false);
    expect(event?.reasonCodes).toContain("SPECIALIST_CRITICAL_COVERAGE_GAP");
  });

  it("keeps the audit fingerprint stable across runtime timestamps when objective specialist evidence is unchanged", () => {
    const first = report({
      generatedAt: "2026-09-09T10:00:00.000Z",
      providerDiagnostics: [{ provider: "fund", capability: "specialized", status: "available", observedAt: "2026-09-09T10:00:00.000Z" }],
    });
    const second = report({
      generatedAt: "2026-09-09T11:00:00.000Z",
      providerDiagnostics: [{ provider: "fund", capability: "specialized", status: "available", observedAt: "2026-09-09T11:00:00.000Z" }],
    });

    expect(createSpecialistRecommendationV3ShadowEvent(first)?.analysisFingerprint)
      .toBe(createSpecialistRecommendationV3ShadowEvent(second)?.analysisFingerprint);
  });

  it("uses the final investment-company specialist analysis and its own model lineage", () => {
    const base = report();
    const investmentCompany = report({
      ticker: "INVE-B.ST",
      companyName: "Investor AB",
      recommendation: "Hold",
      analysisArchetype: "holding_company",
      securityClassification: { kind: "investment_company", confidence: 1, reason: "test", analysisArchetype: "holding_company" },
      securityAnalysis: {
        investmentCompany: {
          kind: "investment_company",
          score: {
            score: 60,
            coverage: 0.85,
            availableWeight: 85,
            applicableWeight: 100,
            factors: [],
            missing: [],
          },
          nav: {
            total: null,
            perShare: 300,
            discountPremium: -0.1,
            source: "reported_nav_per_share",
            relativeToHistoricalMedian: null,
          },
          lookThrough: base.securityAnalysis!.etf!.lookThrough,
          sotp: null,
        },
      },
    });
    const event = createSpecialistRecommendationV3ShadowEvent(investmentCompany);

    expect(event?.analysisArchetype).toBe("holding_company");
    expect(event?.objectiveScore).toBe(60);
    expect(event?.v3Rating).toBe("HOLD");
    expect(event?.modelVersion).toBe(INVESTMENT_COMPANY_SPECIALIST_MODEL_VERSION);
    expect(event?.coverageProfile).toBe("specialist:investment_company");
  });

  it("returns null for ordinary operating-company reports so the canonical corporate V3 shadow remains authoritative", () => {
    const ordinary = report({ securityAnalysis: undefined, securityClassification: undefined });
    expect(createSpecialistRecommendationV3ShadowEvent(ordinary)).toBeNull();
  });

  it("prefers final specialist audit over a pre-enrichment corporate shadow", () => {
    const corporate = { modelVersion: "corporate-pre-enrichment" } as RecommendationV3ShadowEvent;
    const selected = recommendationReviewEventFromAnalysisV3({
      data: report(),
      stockbox3: { recommendationV3Shadow: { status: "evaluated", event: corporate } },
    });

    expect(selected?.modelVersion).toBe(ETF_SPECIALIST_MODEL_VERSION);
    expect(selected).not.toBe(corporate);
  });

  it("does not fall back to a corporate audit when specialist analysis exists but cannot produce specialist lineage", () => {
    const corporate = { modelVersion: "corporate-pre-enrichment" } as RecommendationV3ShadowEvent;
    const selected = recommendationReviewEventFromAnalysisV3({
      data: report({ ticker: "   " }),
      stockbox3: { recommendationV3Shadow: { status: "evaluated", event: corporate } },
    });

    expect(selected).toBeNull();
  });

  it("does not fall back to a corporate audit for a specialist-classified security whose specialist analysis is unavailable", () => {
    const corporate = { modelVersion: "corporate-pre-enrichment" } as RecommendationV3ShadowEvent;
    const specialistWithoutAnalysis = report({
      securityAnalysis: undefined,
      securityClassification: { kind: "equity_etf", confidence: 1, reason: "test" },
    });
    const selected = recommendationReviewEventFromAnalysisV3({
      data: specialistWithoutAnalysis,
      stockbox3: { recommendationV3Shadow: { status: "evaluated", event: corporate } },
    });

    expect(selected).toBeNull();
  });

  it("falls back to canonical corporate shadow for ordinary operating-company reports", () => {
    const corporate = { modelVersion: "corporate-v3" } as RecommendationV3ShadowEvent;
    const ordinary = report({ securityAnalysis: undefined, securityClassification: undefined });
    const selected = recommendationReviewEventFromAnalysisV3({
      data: ordinary,
      stockbox3: { recommendationV3Shadow: { status: "evaluated", event: corporate } },
    });

    expect(selected).toBe(corporate);
  });
});