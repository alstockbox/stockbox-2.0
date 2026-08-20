import type {
  Flag,
  Recommendation,
  RecommendationDecision,
  RedFlag,
  ScoreResult,
  StockBoxScore,
} from "./types";

export function recommend(score: StockBoxScore, redFlags: Flag[]): Recommendation {
  const hasCritical = redFlags.some((flag) => flag.severity === "critical");
  const highFlagCount = redFlags.filter((flag) => flag.severity === "high").length;

  if (score.score >= 82 && score.confidence >= 72 && !hasCritical && highFlagCount === 0) {
    return "Strong Buy";
  }

  if (score.score >= 68 && score.confidence >= 58 && !hasCritical) {
    return "Buy";
  }

  if (score.score <= 25 && score.confidence >= 70 && (hasCritical || highFlagCount >= 2)) {
    return "Strong Sell";
  }

  if (score.score <= 40 && score.confidence >= 55) {
    return "Sell";
  }

  return "Hold";
}

export function deriveRecommendation(score: ScoreResult, redFlags: RedFlag[]): RecommendationDecision {
  const scoreUsed = score.personalizedScore ?? score.stockBoxScore;
  const critical = redFlags.some((flag) => flag.severity === "critical");
  const highCount = redFlags.filter((flag) => flag.severity === "high").length;
  const constraintsApplied: string[] = [];
  let rating: Recommendation = "Hold";

  if (scoreUsed !== null) {
    if (scoreUsed >= 84) rating = "Strong Buy";
    else if (scoreUsed >= 68) rating = "Buy";
    else if (scoreUsed <= 24) rating = "Strong Sell";
    else if (scoreUsed <= 40) rating = "Sell";
  }

  if (score.confidence < 40 && rating !== "Hold") {
    rating = "Hold";
    constraintsApplied.push("Confidence below 40 caps the recommendation at Hold.");
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
