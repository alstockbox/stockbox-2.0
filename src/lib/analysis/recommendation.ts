import type {
  AnalysisArchetype,
  Recommendation,
  RecommendationDecision,
  RedFlag,
  DcfRangeResult,
  ScoreResult,
} from "./types";
import { MIN_DIRECTIONAL_VALUATION_CONFIDENCE, SCORE_COVERAGE_POLICY } from "./config";

const CRITICAL_SPECIALIZED_FIELDS: Partial<Record<AnalysisArchetype, string[]>> = {
  bank: ["cet1CapitalRatio", "grossLoans", "deposits", "tangibleBookValuePerShare"],
  insurer: ["regulatoryCapitalRatio", "bookValue", "returnOnEquity"],
  reit: ["fundsFromOperations", "adjustedFundsFromOperations", "adjustedFundsFromOperationsPayout", "fixedChargeCoverage"],
};

function hasCriticalSpecializedCoverage(score: ScoreResult): boolean {
  const required = CRITICAL_SPECIALIZED_FIELDS[score.analysisArchetype];
  if (!required) return true;
  const missing = new Set(score.specializedCoverage?.missing ?? []);
  return required.every((field) => !missing.has(field));
}

function archetypeValuationScore(score: ScoreResult, valuation?: DcfRangeResult): number | null {
  if (valuation?.status !== "inappropriate") return null;
  if (!["bank", "insurer", "reit"].includes(score.analysisArchetype)) return null;
  if ((score.specializedCoverage?.overall ?? 0) < 0.7) return null;
  if (!hasCriticalSpecializedCoverage(score)) return null;
  const dimension = score.dimensions.valuation;
  return (dimension.coverage ?? 0) >= SCORE_COVERAGE_POLICY.dimensionFull && typeof dimension.score === "number" && Number.isFinite(dimension.score)
    ? dimension.score
    : null;
}

export function deriveRecommendation(
  score: ScoreResult,
  redFlags: RedFlag[],
  valuation?: DcfRangeResult,
): RecommendationDecision {
  const scoreUsed = score.personalizedScore ?? score.stockBoxScore;
  const critical = redFlags.some((flag) => flag.severity === "critical");
  const highCount = redFlags.filter((flag) => flag.severity === "high").length;
  const constraintsApplied: string[] = [];
  let rating: Recommendation = score.dataCoverage < 0.55 || scoreUsed === null ? "No Rating" : "Hold";

  if (scoreUsed !== null && rating !== "No Rating") {
    if (scoreUsed >= 84) rating = "Strong Buy";
    else if (scoreUsed >= 68) rating = "Buy";
    else if (scoreUsed <= 24) rating = "Strong Sell";
    else if (scoreUsed <= 40) rating = "Sell";
  }

  const specializedValuationScore = archetypeValuationScore(score, valuation);
  const dcfValuationAvailable = valuation?.status === "available";
  const dcfValuationConfidenceAdequate = dcfValuationAvailable
    && valuation.directionalSupport !== false
    && (
      valuation.confidence === undefined
      || valuation.confidence >= MIN_DIRECTIONAL_VALUATION_CONFIDENCE
    );
  const adequateValuationCoverage = dcfValuationConfidenceAdequate || specializedValuationScore !== null;

  if (
    rating !== "No Rating"
    && ["bank", "insurer", "reit"].includes(score.analysisArchetype)
    && (score.specializedCoverage?.overall ?? 0) < 0.7
  ) {
    rating = "No Rating";
    constraintsApplied.push("Specialized operating and regulatory coverage is insufficient for this company archetype.");
  }

  if (rating !== "No Rating" && ["bank", "insurer", "reit"].includes(score.analysisArchetype) && !hasCriticalSpecializedCoverage(score)) {
    rating = "No Rating";
    constraintsApplied.push("Critical specialized coverage is incomplete for this company archetype.");
  }

  if (
    rating !== "No Rating"
    && score.analysisArchetype === "insurer"
    && (score.specializedCoverage?.insurerSubtype === "unknown" || score.specializedCoverage?.insurerSubtype === "mixed")
  ) {
    rating = "No Rating";
    constraintsApplied.push("Insurance subtype is unresolved or mixed; specialized insurer methodology is not sufficiently specific for a directional rating.");
  }

  if (rating !== "No Rating" && valuation?.status === "inappropriate" && specializedValuationScore === null) {
    rating = "No Rating";
    constraintsApplied.push("The company archetype requires specialized valuation coverage before a rating is issued.");
  }

  if (rating !== "No Rating" && !adequateValuationCoverage && rating !== "Hold") {
    rating = "Hold";
    constraintsApplied.push("Directional ratings require adequate valuation coverage.");
  }

  const strongBuySupported = dcfValuationAvailable
    ? valuation.impliedUpside !== null && valuation.impliedUpside !== undefined && valuation.impliedUpside >= 0.15
    : specializedValuationScore !== null && specializedValuationScore >= 75;
  if (rating === "Strong Buy" && !strongBuySupported) {
    rating = "Buy";
    constraintsApplied.push("Strong Buy requires meaningful valuation support.");
  }

  const strongSellSupported = dcfValuationAvailable
    ? valuation.impliedUpside !== null && valuation.impliedUpside !== undefined && valuation.impliedUpside <= -0.15
    : specializedValuationScore !== null && specializedValuationScore <= 25;
  if (rating === "Strong Sell" && !strongSellSupported) {
    rating = "Sell";
    constraintsApplied.push("Strong Sell requires meaningful downside support.");
  }

  const buySupported = dcfValuationAvailable
    ? valuation.impliedUpside !== null && valuation.impliedUpside !== undefined && valuation.impliedUpside >= 0.05
    : specializedValuationScore !== null && specializedValuationScore >= 60;
  if (rating === "Buy" && !buySupported) {
    rating = "Hold";
    constraintsApplied.push("Buy requires positive valuation support.");
  }

  const sellSupported = dcfValuationAvailable
    ? valuation.impliedUpside !== null && valuation.impliedUpside !== undefined && valuation.impliedUpside <= -0.05
    : specializedValuationScore !== null && specializedValuationScore <= 40;
  if (rating === "Sell" && !sellSupported) {
    rating = "Hold";
    constraintsApplied.push("Sell requires negative valuation support.");
  }

  if (score.confidence < 40 && rating !== "No Rating") {
    rating = "No Rating";
    constraintsApplied.push("Confidence below 40 results in No Rating.");
  } else if (rating === "Strong Buy" && score.confidence < 72) {
    rating = score.confidence >= 55 ? "Buy" : "Hold";
    constraintsApplied.push("Strong Buy requires confidence of at least 72.");
  } else if (rating === "Strong Sell" && score.confidence < 70) {
    rating = score.confidence >= 55 ? "Sell" : "Hold";
    constraintsApplied.push("Strong Sell requires confidence of at least 70.");
  } else if ((rating === "Buy" || rating === "Sell") && score.confidence < 55) {
    rating = "Hold";
    constraintsApplied.push("Buy and Sell require confidence of at least 55.");
  }

  if (critical && (rating === "Buy" || rating === "Strong Buy")) {
    rating = "Hold";
    constraintsApplied.push("Critical unresolved red flags prevent Buy ratings.");
  }

  if (rating === "Strong Buy" && highCount > 0) {
    rating = "Buy";
    constraintsApplied.push("Unresolved high-severity red flags prevent Strong Buy.");
  }

  if (rating === "Strong Sell" && !critical && highCount < 2) {
    rating = "Sell";
    constraintsApplied.push("Strong Sell requires a critical flag or at least two high-severity flags.");
  }

  return {
    rating,
    scoreUsed,
    confidence: score.confidence,
    rationale: [
      scoreUsed === null ? "Insufficient score coverage." : `Personalized model score is ${Math.round(scoreUsed)}/100.`,
      `Data confidence is ${score.confidence}%.`,
      redFlags.length ? `${redFlags.length} deterministic red flag(s) remain visible.` : "No deterministic red flags were detected.",
    ],
    constraintsApplied,
    disclosure:
      "This is a StockBox model assessment based on available data, assumptions and historical relationships, not a guaranteed outcome or individualized financial advice.",
  };
}
