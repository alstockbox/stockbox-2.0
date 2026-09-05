import type {
  DataStatus,
  DcfRangeResult,
  RedFlag,
  ScoreDimensionKey,
  ScoreResult,
} from "./types";
import type { CoverageAssessment } from "./coverage-v3";

export const RECOMMENDATION_V3_POLICY_VERSION = "stockbox-recommendation-policy-v3.0.0" as const;

export type RecommendationV3Rating =
  | "STRONG_BUY"
  | "BUY"
  | "WAIT"
  | "HOLD"
  | "REDUCE"
  | "SELL"
  | "UNAVAILABLE";

export type RecommendationV3Horizon = "short" | "medium" | "long";

export type RecommendationV3Risk = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | "UNKNOWN";

export type RecommendationDriverV3 = {
  key: ScoreDimensionKey;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  direction: "positive" | "negative" | "neutral";
};

export type RecommendationConfidenceGateV3 = {
  passed: boolean;
  hardBlocked: boolean;
  reasons: string[];
  reasonCodes: string[];
  maximumRating: RecommendationV3Rating | null;
};

export type RecommendationAuditV3 = {
  policyVersion: typeof RECOMMENDATION_V3_POLICY_VERSION;
  modelVersion: string;
  analysisDate: string | null;
  inputFingerprint: string | null;
  horizon: RecommendationV3Horizon;
  objectiveScore: number | null;
  userMatchScore: number | null;
  scoreConfidence: number;
  coverageProfile: string;
  verifiedCoverage: number;
  retrievalCoverage: number;
  conflictCount: number;
  stockboxFailureCount: number;
  recommendationEligible: boolean;
  reasonCodes: string[];
};

export type RecommendationDecisionV3 = {
  rating: RecommendationV3Rating;
  objectiveScore: number | null;
  /**
   * User match is presentation context only. It MUST NOT influence `rating`.
   */
  userMatchScore: number | null;
  conviction: number;
  calibrationStatus: "UNCALIBRATED_V3_BASELINE";
  risk: RecommendationV3Risk;
  dataQuality: number;
  modelUncertainty: number;
  horizon: RecommendationV3Horizon;
  drivers: RecommendationDriverV3[];
  confidenceGate: RecommendationConfidenceGateV3;
  rationale: string[];
  constraintsApplied: string[];
  audit: RecommendationAuditV3;
  disclosure: string;
};

export type RecommendationV3Options = {
  redFlags?: RedFlag[];
  valuation?: DcfRangeResult;
  dataStatus?: DataStatus;
  horizon?: RecommendationV3Horizon;
  analysisDate?: string | null;
  modelVersion?: string;
  inputFingerprint?: string | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function objectiveScoreForHorizon(score: ScoreResult, horizon: RecommendationV3Horizon) {
  if (horizon === "short" && finite(score.shortTermScore)) return score.shortTermScore;
  if (horizon === "long" && finite(score.longTermScore)) return score.longTermScore;
  return finite(score.stockBoxScore) ? score.stockBoxScore : null;
}

function baseRating(score: number | null): RecommendationV3Rating {
  if (score === null) return "UNAVAILABLE";
  if (score >= 84) return "STRONG_BUY";
  if (score >= 68) return "BUY";
  if (score >= 56) return "HOLD";
  if (score >= 45) return "WAIT";
  if (score >= 30) return "REDUCE";
  return "SELL";
}

function riskFromScore(score: ScoreResult): RecommendationV3Risk {
  const risk = score.dimensions.risk?.score;
  if (!finite(risk)) return "UNKNOWN";
  // Score dimensions are quality-oriented: a high risk-dimension score means
  // a healthier/less risky profile, not more raw risk.
  if (risk >= 72) return "LOW";
  if (risk >= 55) return "MEDIUM";
  if (risk >= 38) return "HIGH";
  return "VERY_HIGH";
}

function driversFromScore(score: ScoreResult): RecommendationDriverV3[] {
  return Object.entries(score.dimensions)
    .flatMap(([key, dimension]) => {
      if (!finite(dimension.score)) return [];
      const weight = finite(dimension.weight) ? dimension.weight : 0;
      const contribution = Math.round((dimension.score - 50) * weight * 10) / 10;
      return [{
        key: key as ScoreDimensionKey,
        label: dimension.label,
        score: Math.round(dimension.score),
        weight,
        contribution,
        direction: contribution > 0.5 ? "positive" as const : contribution < -0.5 ? "negative" as const : "neutral" as const,
      }];
    })
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

function buildConfidenceGate(
  score: ScoreResult,
  coverage: CoverageAssessment,
  options: RecommendationV3Options,
): RecommendationConfidenceGateV3 {
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  let hardBlocked = false;
  let maximumRating: RecommendationV3Rating | null = null;

  const add = (code: string, reason: string) => {
    reasonCodes.push(code);
    reasons.push(reason);
  };

  if (options.dataStatus === "unavailable") {
    hardBlocked = true;
    maximumRating = "UNAVAILABLE";
    add("DATA_UNAVAILABLE", "Canonical analysis data is unavailable.");
  }

  if (score.stockBoxScore === null) {
    hardBlocked = true;
    maximumRating = "UNAVAILABLE";
    add("OBJECTIVE_SCORE_UNAVAILABLE", "The objective StockBox score could not be calculated.");
  }

  if (coverage.verifiedCoverage < 0.55) {
    hardBlocked = true;
    maximumRating = "UNAVAILABLE";
    add("CRITICAL_COVERAGE_GAP", "Verified required-data coverage is below the minimum needed for an instrument assessment.");
  } else if (!coverage.recommendationEligible) {
    maximumRating = "WAIT";
    add("COVERAGE_GATE", "Coverage policy does not permit a directional recommendation yet.");
  }

  if (coverage.conflictCount > 0) {
    maximumRating = hardBlocked ? maximumRating : "WAIT";
    add("UNRESOLVED_DATA_CONFLICT", "One or more required datapoints have unresolved source conflicts.");
  }

  if (coverage.stockboxFailureCount > 0) {
    maximumRating = hardBlocked ? maximumRating : "WAIT";
    add("STOCKBOX_RETRIEVAL_FAILURE", "StockBox failed to retrieve one or more required datapoints; the company is not penalized for this.");
  }

  if (options.dataStatus === "stale") {
    if (!hardBlocked && maximumRating === null) maximumRating = "BUY";
    add("STALE_DATA", "Some canonical data is stale, so the confidence gate limits rating strength.");
  }

  if (score.confidence < 40) {
    maximumRating = hardBlocked ? maximumRating : "WAIT";
    add("LOW_MODEL_CONFIDENCE", "Model confidence is below 40%.");
  } else if (score.confidence < 55) {
    maximumRating = hardBlocked ? maximumRating : "WAIT";
    add("LIMITED_MODEL_CONFIDENCE", "Model confidence is below the threshold for directional ratings.");
  }

  const criticalFlags = (options.redFlags ?? []).filter((flag) => flag.severity === "critical").length;
  if (criticalFlags > 0) {
    maximumRating = hardBlocked ? maximumRating : "WAIT";
    add("CRITICAL_RED_FLAG", "Critical unresolved red flags prevent a positive directional rating.");
  }

  return {
    passed: !hardBlocked && maximumRating === null,
    hardBlocked,
    reasons,
    reasonCodes,
    maximumRating,
  };
}

function applyGate(rating: RecommendationV3Rating, gate: RecommendationConfidenceGateV3): RecommendationV3Rating {
  if (gate.hardBlocked) return "UNAVAILABLE";
  if (gate.maximumRating === "WAIT") {
    if (["STRONG_BUY", "BUY", "REDUCE", "SELL"].includes(rating)) return "WAIT";
    return rating;
  }
  if (gate.maximumRating === "BUY" && rating === "STRONG_BUY") return "BUY";
  return rating;
}

function applyValuationGuard(
  rating: RecommendationV3Rating,
  score: ScoreResult,
  valuation: DcfRangeResult | undefined,
  constraints: string[],
): RecommendationV3Rating {
  const valuationDimension = score.dimensions.valuation;
  const valuationCoverage = valuationDimension?.coverage ?? 0;

  if (rating === "UNAVAILABLE" || rating === "WAIT" || rating === "HOLD") return rating;

  if (valuation?.status === "available" && finite(valuation.impliedUpside)) {
    if (rating === "STRONG_BUY" && valuation.impliedUpside < 0.15) {
      constraints.push("Strong Buy requires at least 15% verified valuation upside.");
      return valuation.impliedUpside >= 0.05 ? "BUY" : "HOLD";
    }
    if (rating === "BUY" && valuation.impliedUpside < 0.05) {
      constraints.push("Buy requires at least 5% verified valuation upside.");
      return "HOLD";
    }
    if (rating === "SELL" && valuation.impliedUpside > -0.10) {
      constraints.push("Sell requires at least 10% verified valuation downside when a directional valuation is available.");
      return valuation.impliedUpside <= -0.03 ? "REDUCE" : "WAIT";
    }
    if (rating === "REDUCE" && valuation.impliedUpside > -0.03) {
      constraints.push("Reduce requires verified negative valuation support when a directional valuation is available.");
      return "WAIT";
    }
    return rating;
  }

  if (valuationCoverage < 0.8) {
    constraints.push("Directional ratings require adequate verified valuation coverage.");
    return "WAIT";
  }

  return rating;
}

function convictionScore(score: ScoreResult, coverage: CoverageAssessment, gate: RecommendationConfidenceGateV3) {
  if (gate.hardBlocked) return 0;
  const quality = clamp(coverage.verifiedCoverage, 0, 1);
  const retrieval = clamp(coverage.retrievalCoverage, 0, 1);
  let conviction = score.confidence * (0.55 + quality * 0.30 + retrieval * 0.15);
  conviction -= coverage.conflictCount * 10;
  conviction -= coverage.stockboxFailureCount * 8;
  if (gate.reasonCodes.includes("STALE_DATA")) conviction -= 10;
  return Math.round(clamp(conviction, 0, 100));
}

export function deriveRecommendationV3(
  score: ScoreResult,
  coverage: CoverageAssessment,
  options: RecommendationV3Options = {},
): RecommendationDecisionV3 {
  const horizon = options.horizon ?? "medium";
  const objectiveScore = objectiveScoreForHorizon(score, horizon);
  const gate = buildConfidenceGate(score, coverage, options);
  const constraintsApplied: string[] = [];

  let rating = baseRating(objectiveScore);
  rating = applyGate(rating, gate);
  rating = applyValuationGuard(rating, score, options.valuation, constraintsApplied);

  if (rating === "STRONG_BUY" && score.confidence < 72) {
    rating = score.confidence >= 55 ? "BUY" : "WAIT";
    constraintsApplied.push("Strong Buy requires model confidence of at least 72%.");
  }

  const highFlags = (options.redFlags ?? []).filter((flag) => flag.severity === "high").length;
  if (rating === "STRONG_BUY" && highFlags > 0) {
    rating = "BUY";
    constraintsApplied.push("Unresolved high-severity red flags prevent Strong Buy.");
  }

  const drivers = driversFromScore(score);
  const dataQuality = Math.round(clamp(
    coverage.verifiedCoverage * 70 + coverage.retrievalCoverage * 20 + score.confidence / 10,
    0,
    100,
  ));
  const conviction = convictionScore(score, coverage, gate);
  const modelUncertainty = 100 - conviction;

  const reasonCodes = [...gate.reasonCodes];
  if (horizon === "short" && score.shortTermScore === null) reasonCodes.push("SHORT_HORIZON_FALLBACK_TO_OBJECTIVE_SCORE");
  if (horizon === "long" && score.longTermScore === null) reasonCodes.push("LONG_HORIZON_FALLBACK_TO_OBJECTIVE_SCORE");

  return {
    rating,
    objectiveScore,
    userMatchScore: finite(score.personalizedScore) ? score.personalizedScore : null,
    conviction,
    calibrationStatus: "UNCALIBRATED_V3_BASELINE",
    risk: riskFromScore(score),
    dataQuality,
    modelUncertainty,
    horizon,
    drivers,
    confidenceGate: gate,
    rationale: [
      objectiveScore === null
        ? "Objective StockBox score is unavailable."
        : `Objective StockBox score is ${Math.round(objectiveScore)}/100 for the selected horizon.`,
      `Verified required-data coverage is ${Math.round(coverage.verifiedCoverage * 100)}%.`,
      `Model confidence is ${Math.round(score.confidence)}%.`,
      "User preference matching is reported separately and never changes the objective rating.",
    ],
    constraintsApplied,
    audit: {
      policyVersion: RECOMMENDATION_V3_POLICY_VERSION,
      modelVersion: options.modelVersion ?? "stockbox-analysis-v3-shadow",
      analysisDate: options.analysisDate ?? null,
      inputFingerprint: options.inputFingerprint ?? null,
      horizon,
      objectiveScore,
      userMatchScore: finite(score.personalizedScore) ? score.personalizedScore : null,
      scoreConfidence: score.confidence,
      coverageProfile: coverage.profileId,
      verifiedCoverage: coverage.verifiedCoverage,
      retrievalCoverage: coverage.retrievalCoverage,
      conflictCount: coverage.conflictCount,
      stockboxFailureCount: coverage.stockboxFailureCount,
      recommendationEligible: coverage.recommendationEligible,
      reasonCodes,
    },
    disclosure:
      "StockBox provides an objective model-based instrument assessment from verified available data. User preferences are shown separately as match context and do not constitute individualized suitability advice.",
  };
}

export function recommendationV3Label(rating: RecommendationV3Rating, locale: "sv" | "en") {
  const labels: Record<"sv" | "en", Record<RecommendationV3Rating, string>> = {
    sv: {
      STRONG_BUY: "STARKT KÖP",
      BUY: "KÖP",
      WAIT: "AVVAKTA",
      HOLD: "BEHÅLL",
      REDUCE: "MINSKA",
      SELL: "SÄLJ",
      UNAVAILABLE: "EJ BEDÖMBAR",
    },
    en: {
      STRONG_BUY: "STRONG BUY",
      BUY: "BUY",
      WAIT: "WAIT",
      HOLD: "HOLD",
      REDUCE: "REDUCE",
      SELL: "SELL",
      UNAVAILABLE: "UNAVAILABLE",
    },
  };
  return labels[locale][rating];
}
