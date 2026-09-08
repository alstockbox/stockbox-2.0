import { describe, expect, it } from "vitest";
import type { RecommendationV3ShadowEvent } from "@/lib/analysis/recommendation-v3-shadow";
import {
  advanceRecommendationCalibrationV3,
  createRecommendationSnapshotV3,
  evaluateRecommendationOutcomeV3,
  evaluateRecommendationPerformanceV3,
  isRecommendationOutcomeDueV3,
  proposeRecommendationCalibrationV3,
  recommendationOutcomeExpectedAtV3,
  type RecommendationPerformanceSliceV3,
  type RecommendationSnapshotV3,
} from "@/lib/analysis/recommendation-learning-v3";

function shadowEvent(overrides: Partial<RecommendationV3ShadowEvent> = {}): RecommendationV3ShadowEvent {
  return {
    event: "stockbox.recommendation_v3_shadow",
    observedAt: "2026-09-01T12:00:00.000Z",
    ticker: " msft ",
    analysisFingerprint: "fingerprint-1",
    analysisArchetype: "standard",
    legacyRating: "Buy",
    normalizedLegacyRating: "BUY",
    v3Rating: "BUY",
    changed: false,
    objectiveScore: 76,
    conviction: 82,
    dataQuality: 91,
    modelUncertainty: 18,
    hadPersonalizedScore: true,
    confidenceGatePassed: true,
    confidenceGateHardBlocked: false,
    reasonCodes: ["VERIFIED_INPUTS"],
    coveragePolicyVersion: "coverage-v3-test" as RecommendationV3ShadowEvent["coveragePolicyVersion"],
    anomalyPolicyVersion: "anomaly-v3-test" as RecommendationV3ShadowEvent["anomalyPolicyVersion"],
    recommendationPolicyVersion: "stockbox-recommendation-policy-v3.0.0",
    coverageProfile: "standard",
    verifiedCoverage: 0.91,
    retrievalCoverage: 0.95,
    conflictCount: 0,
    stockboxFailureCount: 0,
    sourceUnavailableCount: 0,
    recommendationEligible: true,
    dataIntegrityScore: 96,
    blockingAnomalyCount: 0,
    anomalyCodes: [],
    recommendationIntegrityEligible: true,
    modelVersion: "stockbox-analysis-v3-test",
    ...overrides,
  };
}

function snapshot(overrides: Partial<RecommendationSnapshotV3> = {}): RecommendationSnapshotV3 {
  return {
    snapshotId: "MSFT:fingerprint-1:model:policy",
    observedAt: "2026-09-01T12:00:00.000Z",
    ticker: "MSFT",
    analysisFingerprint: "fingerprint-1",
    analysisArchetype: "standard",
    modelVersion: "stockbox-analysis-v3-test",
    recommendationPolicyVersion: "stockbox-recommendation-policy-v3.0.0",
    rating: "BUY",
    objectiveScore: 76,
    conviction: 82,
    dataQuality: 91,
    modelUncertainty: 18,
    reasonCodes: [],
    ...overrides,
  };
}

describe("Recommendation learning V3", () => {
  it("creates a privacy-minimized immutable objective snapshot from shadow telemetry", () => {
    const result = createRecommendationSnapshotV3(shadowEvent());

    expect(result.ticker).toBe("MSFT");
    expect(result.rating).toBe("BUY");
    expect(result.snapshotId).toContain("fingerprint-1");
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("personalized");
    expect(JSON.stringify(result)).not.toContain("userMatch");
  });

  it("knows exactly when each recommendation outcome becomes due", () => {
    const source = snapshot();
    expect(recommendationOutcomeExpectedAtV3(source, "7d")).toBe("2026-09-08T12:00:00.000Z");
    expect(isRecommendationOutcomeDueV3(source, "7d", "2026-09-08T11:59:59.000Z")).toBe(false);
    expect(isRecommendationOutcomeDueV3(source, "7d", "2026-09-08T12:00:00.000Z")).toBe(true);
  });

  it("calculates benchmark-relative returns and directional hits for Buy", () => {
    const outcome = evaluateRecommendationOutcomeV3({
      snapshot: snapshot({ rating: "BUY" }),
      horizon: "7d",
      entryPrice: 100,
      benchmarkEntryPrice: 100,
      benchmarkTicker: "SPY",
      observation: {
        observedAt: "2026-09-08T12:00:00.000Z",
        price: 110,
        benchmarkPrice: 102,
      },
    });

    expect(outcome).not.toBeNull();
    expect(outcome?.securityReturn).toBeCloseTo(0.1, 8);
    expect(outcome?.benchmarkReturn).toBeCloseTo(0.02, 8);
    expect(outcome?.excessReturn).toBeCloseTo(0.08, 8);
    expect(outcome?.directionalHit).toBe(true);
  });

  it("scores Sell as a hit when it underperforms the benchmark", () => {
    const outcome = evaluateRecommendationOutcomeV3({
      snapshot: snapshot({ rating: "SELL" }),
      horizon: "7d",
      entryPrice: 100,
      benchmarkEntryPrice: 100,
      benchmarkTicker: "SPY",
      observation: {
        observedAt: "2026-09-08T12:00:00.000Z",
        price: 90,
        benchmarkPrice: 100,
      },
    });

    expect(outcome?.excessReturn).toBeCloseTo(-0.1, 8);
    expect(outcome?.directionalHit).toBe(true);
  });

  it("never evaluates a horizon early and keeps non-directional ratings out of hit rate", () => {
    const early = evaluateRecommendationOutcomeV3({
      snapshot: snapshot(),
      horizon: "30d",
      entryPrice: 100,
      observation: { observedAt: "2026-09-20T12:00:00.000Z", price: 105 },
    });
    const hold = evaluateRecommendationOutcomeV3({
      snapshot: snapshot({ rating: "HOLD" }),
      horizon: "7d",
      entryPrice: 100,
      benchmarkEntryPrice: 100,
      observation: { observedAt: "2026-09-08T12:00:00.000Z", price: 101, benchmarkPrice: 100 },
    });

    expect(early).toBeNull();
    expect(hold?.directionalHit).toBeNull();
  });

  it("aggregates recommendation performance by rating and horizon", () => {
    const outcomes = [110, 108, 95].map((price, index) => evaluateRecommendationOutcomeV3({
      snapshot: snapshot({ snapshotId: `snapshot-${index}`, rating: "BUY" }),
      horizon: "7d" as const,
      entryPrice: 100,
      benchmarkEntryPrice: 100,
      benchmarkTicker: "SPY",
      observation: { observedAt: "2026-09-08T12:00:00.000Z", price, benchmarkPrice: 102 },
    })).filter((value): value is NonNullable<typeof value> => value !== null);

    const [performance] = evaluateRecommendationPerformanceV3(outcomes);
    expect(performance?.count).toBe(3);
    expect(performance?.benchmarkCount).toBe(3);
    expect(performance?.directionalCount).toBe(3);
    expect(performance?.hitRate).toBeCloseTo(2 / 3, 8);
  });

  it("only proposes calibration after enough benchmarked evidence shows drift", () => {
    const weak: RecommendationPerformanceSliceV3 = {
      horizon: "30d",
      rating: "BUY",
      count: 40,
      benchmarkCount: 40,
      directionalCount: 40,
      hitRate: 0.4,
      meanSecurityReturn: -0.01,
      meanExcessReturn: -0.03,
      medianExcessReturn: -0.025,
    };

    const candidate = proposeRecommendationCalibrationV3(weak, {
      createdAt: "2026-09-08T12:00:00.000Z",
    });
    expect(candidate?.stage).toBe("CANDIDATE");
    expect(candidate?.reasons).toContain("MEAN_EXCESS_RETURN_BELOW_MINUS_2_PERCENT");
    expect(candidate?.reasons).toContain("DIRECTIONAL_HIT_RATE_BELOW_45_PERCENT");

    expect(proposeRecommendationCalibrationV3({ ...weak, benchmarkCount: 10, directionalCount: 10 })).toBeNull();
  });

  it("enforces candidate -> backtest -> shadow -> approval -> production with explicit approval", () => {
    const candidate = proposeRecommendationCalibrationV3({
      horizon: "30d",
      rating: "BUY",
      count: 40,
      benchmarkCount: 40,
      directionalCount: 40,
      hitRate: 0.4,
      meanSecurityReturn: -0.01,
      meanExcessReturn: -0.03,
      medianExcessReturn: -0.025,
    }, { createdAt: "2026-09-08T12:00:00.000Z" });
    if (!candidate) throw new Error("Expected calibration candidate");

    expect(() => advanceRecommendationCalibrationV3(candidate, "PRODUCTION", { explicitApproval: true }))
      .toThrow("INVALID_CALIBRATION_STAGE_TRANSITION");

    const backtested = advanceRecommendationCalibrationV3(candidate, "BACKTESTED");
    expect(() => advanceRecommendationCalibrationV3(backtested, "SHADOW_VALIDATED"))
      .toThrow("CALIBRATION_BACKTEST_IMPROVEMENT_REQUIRED");
    const shadow = advanceRecommendationCalibrationV3(backtested, "SHADOW_VALIDATED", { backtestImproved: true });
    const approved = advanceRecommendationCalibrationV3(shadow, "APPROVED", { shadowImproved: true });

    expect(() => advanceRecommendationCalibrationV3(approved, "PRODUCTION", {
      backtestImproved: true,
      shadowImproved: true,
    })).toThrow("CALIBRATION_EXPLICIT_APPROVAL_AND_EVIDENCE_REQUIRED");

    const production = advanceRecommendationCalibrationV3(approved, "PRODUCTION", {
      backtestImproved: true,
      shadowImproved: true,
      explicitApproval: true,
    });
    expect(production.stage).toBe("PRODUCTION");
  });
});
