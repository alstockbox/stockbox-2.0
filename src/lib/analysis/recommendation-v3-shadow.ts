import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { assessCoverageV3, type CoverageAssessment } from "./coverage-v3";
import {
  deriveRecommendationV3,
  RECOMMENDATION_V3_POLICY_VERSION,
  type RecommendationDecisionV3,
  type RecommendationV3Rating,
} from "./recommendation-v3";
import type { FinancialAnalysisInput, FinancialAnalysisResult } from "./types";

export type RecommendationV3ShadowEvent = {
  event: "stockbox.recommendation_v3_shadow";
  observedAt: string;
  ticker: string;
  analysisFingerprint: string | null;
  analysisArchetype: string;
  legacyRating: string;
  normalizedLegacyRating: RecommendationV3Rating;
  v3Rating: RecommendationV3Rating;
  changed: boolean;
  objectiveScore: number | null;
  conviction: number;
  dataQuality: number;
  modelUncertainty: number;
  hadPersonalizedScore: boolean;
  confidenceGatePassed: boolean;
  confidenceGateHardBlocked: boolean;
  reasonCodes: string[];
  coveragePolicyVersion: CoverageAssessment["policyVersion"];
  recommendationPolicyVersion: typeof RECOMMENDATION_V3_POLICY_VERSION;
  coverageProfile: string;
  verifiedCoverage: number;
  retrievalCoverage: number;
  conflictCount: number;
  stockboxFailureCount: number;
  sourceUnavailableCount: number;
  recommendationEligible: boolean;
  modelVersion: string;
};

export type RecommendationV3ShadowFailureEvent = {
  event: "stockbox.recommendation_v3_shadow_failure";
  observedAt: string;
  ticker: string;
  analysisFingerprint: string | null;
  errorName: string;
};

export type RecommendationV3ShadowRuntime = {
  enabled?: boolean;
  killed?: boolean;
  now?: () => string;
  emit?: (event: RecommendationV3ShadowEvent | RecommendationV3ShadowFailureEvent) => void;
};

export type RecommendationV3ShadowResult =
  | { status: "disabled" }
  | { status: "killed" }
  | {
      status: "evaluated";
      event: RecommendationV3ShadowEvent;
      decision: RecommendationDecisionV3;
      coverage: CoverageAssessment;
      emitted: boolean;
    }
  | { status: "failed"; errorCode: "SHADOW_EVALUATION_FAILED"; emitted: boolean };

function normalizedLegacyRating(rating: string): RecommendationV3Rating {
  switch (rating) {
    case "Strong Buy":
      return "STRONG_BUY";
    case "Buy":
      return "BUY";
    case "Hold":
      return "HOLD";
    case "Sell":
    case "Strong Sell":
      return "SELL";
    case "No Rating":
      return "UNAVAILABLE";
    default:
      return "UNAVAILABLE";
  }
}

function defaultEmitter(event: RecommendationV3ShadowEvent | RecommendationV3ShadowFailureEvent) {
  // Shadow telemetry intentionally contains no user id, raw financial payload,
  // provider secret or personalized score. The feature is dark by default, so
  // this adds no production logging volume unless Recommendation V3 is enabled.
  console.info("[stockbox3-shadow]", event);
}

function safeEmit(
  emitter: RecommendationV3ShadowRuntime["emit"],
  event: RecommendationV3ShadowEvent | RecommendationV3ShadowFailureEvent,
): boolean {
  try {
    (emitter ?? defaultEmitter)(event);
    return true;
  } catch {
    // Telemetry is explicitly non-critical. An observability outage must never
    // change, delay or fail the canonical StockBox 2.x analysis response.
    return false;
  }
}

export function evaluateRecommendationV3Shadow(
  input: FinancialAnalysisInput,
  result: FinancialAnalysisResult,
  observedAt = new Date().toISOString(),
): {
  event: RecommendationV3ShadowEvent;
  decision: RecommendationDecisionV3;
  coverage: CoverageAssessment;
} {
  const coverage = assessCoverageV3(input, result);
  const decision = deriveRecommendationV3(result.scores, coverage, {
    redFlags: result.redFlags,
    valuation: result.dcf,
    dataStatus: result.dataStatus,
    horizon: "medium",
    analysisDate: input.analysisDate ?? null,
    modelVersion: result.modelVersion,
    inputFingerprint: result.canonicalInputFingerprint ?? null,
  });
  const legacyRating = String(result.recommendation.rating);
  const normalizedLegacy = normalizedLegacyRating(legacyRating);

  return {
    coverage,
    decision,
    event: {
      event: "stockbox.recommendation_v3_shadow",
      observedAt,
      ticker: input.company.canonicalTicker ?? input.company.ticker,
      analysisFingerprint: result.canonicalInputFingerprint ?? null,
      analysisArchetype: result.analysisArchetype,
      legacyRating,
      normalizedLegacyRating: normalizedLegacy,
      v3Rating: decision.rating,
      changed: normalizedLegacy !== decision.rating,
      objectiveScore: decision.objectiveScore,
      conviction: decision.conviction,
      dataQuality: decision.dataQuality,
      modelUncertainty: decision.modelUncertainty,
      hadPersonalizedScore: typeof result.scores.personalizedScore === "number" && Number.isFinite(result.scores.personalizedScore),
      confidenceGatePassed: decision.confidenceGate.passed,
      confidenceGateHardBlocked: decision.confidenceGate.hardBlocked,
      reasonCodes: [...decision.audit.reasonCodes],
      coveragePolicyVersion: coverage.policyVersion,
      recommendationPolicyVersion: RECOMMENDATION_V3_POLICY_VERSION,
      coverageProfile: coverage.profileId,
      verifiedCoverage: coverage.verifiedCoverage,
      retrievalCoverage: coverage.retrievalCoverage,
      conflictCount: coverage.conflictCount,
      stockboxFailureCount: coverage.stockboxFailureCount,
      sourceUnavailableCount: coverage.sourceUnavailableCount,
      recommendationEligible: coverage.recommendationEligible,
      modelVersion: result.modelVersion,
    },
  };
}

/**
 * Executes Recommendation V3 as a side-channel only. This function is fail-open
 * by design: callers can invoke it after a canonical legacy result is complete
 * and safely ignore the return value. It never mutates `input` or `result`.
 */
export function runRecommendationV3Shadow(
  input: FinancialAnalysisInput,
  result: FinancialAnalysisResult,
  runtime: RecommendationV3ShadowRuntime = {},
): RecommendationV3ShadowResult {
  const enabled = runtime.enabled ?? isFeatureEnabled("recommendationV3");
  if (!enabled) return { status: "disabled" };

  const killed = runtime.killed ?? isKilled("recommendationEngine");
  if (killed) return { status: "killed" };

  const observedAt = runtime.now?.() ?? new Date().toISOString();
  try {
    const evaluated = evaluateRecommendationV3Shadow(input, result, observedAt);
    const emitted = safeEmit(runtime.emit, evaluated.event);
    return { status: "evaluated", ...evaluated, emitted };
  } catch (error) {
    const failureEvent: RecommendationV3ShadowFailureEvent = {
      event: "stockbox.recommendation_v3_shadow_failure",
      observedAt,
      ticker: input.company.canonicalTicker ?? input.company.ticker,
      analysisFingerprint: result.canonicalInputFingerprint ?? null,
      errorName: error instanceof Error && error.name ? error.name : "UnknownError",
    };
    const emitted = safeEmit(runtime.emit, failureEvent);
    return { status: "failed", errorCode: "SHADOW_EVALUATION_FAILED", emitted };
  }
}
