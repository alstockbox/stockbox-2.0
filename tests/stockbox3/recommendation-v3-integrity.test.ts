import { describe, expect, it } from "vitest";
import { deriveRecommendationV3WithIntegrity } from "@/lib/analysis/recommendation-v3-integrity";
import type { CoverageAssessment } from "@/lib/analysis/coverage-v3";
import type { DataAnomalyAssessmentV3 } from "@/lib/analysis/data-anomaly-v3";
import type { ScoreDimension, ScoreDimensionKey, ScoreResult } from "@/lib/analysis/types";

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

function scoreFixture(): ScoreResult {
  const dimensions = Object.fromEntries(
    dimensionKeys.map((key) => [
      key,
      {
        key,
        label: key,
        score: key === "valuation" ? 90 : key === "risk" ? 75 : 82,
        weight: key === "valuation" ? 0.2 : 0.1,
        coverage: 1,
        contributors: [],
      } satisfies ScoreDimension,
    ]),
  ) as unknown as Record<ScoreDimensionKey, ScoreDimension>;

  return {
    stockBoxScore: 88,
    personalizedScore: 12,
    investmentProfile: "balanced",
    sector: "technology",
    analysisArchetype: "standard",
    confidence: 90,
    confidenceBreakdown: {} as ScoreResult["confidenceBreakdown"],
    dataCoverage: 1,
    dimensions,
    shortTermScore: 80,
    longTermScore: 90,
  } as ScoreResult;
}

function coverageFixture(): CoverageAssessment {
  return {
    policyVersion: "stockbox-coverage-policy-v3.0.0",
    profileId: "standard",
    profileLabel: "Standard operating company",
    verifiedCoverage: 1,
    retrievalCoverage: 1,
    disclosureCoverage: 1,
    dataPoints: [],
    blockingIssues: [],
    stockboxFailureCount: 0,
    sourceUnavailableCount: 0,
    companyDisclosureGapCount: 0,
    conflictCount: 0,
    verifiedCount: 10,
    conditionalMetricCount: 0,
    recommendationEligible: true,
    fairness: {
      stockboxFailuresPenalizeCompanyQuality: false,
      sourceUnavailablePenalizesCompanyQuality: false,
      dataConflictsPenalizeCompanyQuality: false,
      confirmedNonReportingMayCreateDisclosureConcern: true,
    },
  } as CoverageAssessment;
}

function integrityFixture(overrides: Partial<DataAnomalyAssessmentV3> = {}): DataAnomalyAssessmentV3 {
  return {
    policyVersion: "stockbox-data-anomaly-policy-v3.0.0",
    anomalies: [],
    blockingAnomalies: [],
    integrityScore: 100,
    recommendationIntegrityEligible: true,
    counts: { info: 0, warning: 0, high: 0, critical: 0, blocking: 0 },
    fairness: { systemIntegrityAnomaliesPenalizeCompanyQuality: false },
    ...overrides,
  } as DataAnomalyAssessmentV3;
}

function blockingAnomaly(code: DataAnomalyAssessmentV3["anomalies"][number]["code"], severity: "high" | "critical") {
  return {
    code,
    severity,
    blockingForRecommendation: true,
    companyQualityImpact: "none" as const,
    scope: code === "ENTITY_IDENTITY_UNCERTAIN" ? "company_identity" as const : "financials" as const,
    metric: null,
    periodEnd: null,
    reason: `fixture ${code}`,
    evidence: {},
  };
}

describe("Recommendation V3 integrity gate", () => {
  it("leaves a clean high-confidence recommendation unchanged", () => {
    const decision = deriveRecommendationV3WithIntegrity(
      scoreFixture(),
      coverageFixture(),
      integrityFixture(),
    );

    expect(decision.rating).toBe("STRONG_BUY");
    expect(decision.conviction).toBeGreaterThanOrEqual(80);
    expect(decision.confidenceGate.passed).toBe(true);
  });

  it("hard-blocks critical integrity failures even when objective score is very high", () => {
    const issue = blockingAnomaly("FUTURE_DATED_FINANCIAL", "critical");
    const integrity = integrityFixture({
      anomalies: [issue],
      blockingAnomalies: [issue],
      integrityScore: 65,
      recommendationIntegrityEligible: false,
      counts: { info: 0, warning: 0, high: 0, critical: 1, blocking: 1 },
    });

    const decision = deriveRecommendationV3WithIntegrity(scoreFixture(), coverageFixture(), integrity);

    expect(decision.objectiveScore).toBe(88);
    expect(decision.rating).toBe("UNAVAILABLE");
    expect(decision.conviction).toBe(0);
    expect(decision.confidenceGate.hardBlocked).toBe(true);
    expect(decision.audit.reasonCodes).toContain("DATA_ANOMALY_FUTURE_DATED_FINANCIAL");
  });

  it("caps unresolved source-integrity problems at WAIT instead of inventing directional certainty", () => {
    const issue = blockingAnomaly("UNRESOLVED_SOURCE_CONFLICT", "critical");
    const integrity = integrityFixture({
      anomalies: [issue],
      blockingAnomalies: [issue],
      integrityScore: 65,
      recommendationIntegrityEligible: false,
      counts: { info: 0, warning: 0, high: 0, critical: 1, blocking: 1 },
    });

    const decision = deriveRecommendationV3WithIntegrity(scoreFixture(), coverageFixture(), integrity);

    expect(decision.rating).toBe("WAIT");
    expect(decision.conviction).toBeLessThanOrEqual(35);
    expect(decision.confidenceGate.maximumRating).toBe("WAIT");
    expect(decision.confidenceGate.passed).toBe(false);
  });

  it("allows non-blocking heuristics to reduce confidence without changing the objective direction", () => {
    const warning = {
      ...blockingAnomaly("BALANCE_SHEET_IDENTITY_MISMATCH", "high"),
      blockingForRecommendation: false,
    };
    const integrity = integrityFixture({
      anomalies: [warning],
      blockingAnomalies: [],
      integrityScore: 80,
      recommendationIntegrityEligible: true,
      counts: { info: 0, warning: 0, high: 1, critical: 0, blocking: 0 },
    });

    const decision = deriveRecommendationV3WithIntegrity(scoreFixture(), coverageFixture(), integrity);

    expect(decision.rating).toBe("STRONG_BUY");
    expect(decision.conviction).toBeLessThanOrEqual(80);
    expect(decision.dataQuality).toBeLessThanOrEqual(80);
  });
});
