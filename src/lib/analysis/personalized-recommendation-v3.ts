import type {
  RecommendationDecisionV3,
  RecommendationV3Rating,
} from "./recommendation-v3";

export type RecommendationViewModeV3 = "general" | "personalized";
export type InvestorRiskPreferenceV3 = "defensive" | "balanced" | "aggressive";
export type InvestorHorizonV3 = "short" | "medium" | "long";
export type InvestorStyleV3 = "balanced" | "growth" | "quality" | "value";

export type PersonalizedInvestorProfileV3 = {
  riskPreference: InvestorRiskPreferenceV3;
  horizon: InvestorHorizonV3;
  style: InvestorStyleV3;
};

export type PersonalizedCandidateSignalsV3 = {
  valuation?: number | null;
  growth?: number | null;
  quality?: number | null;
  risk?: number | null;
  momentum?: number | null;
};

export type PersonalizedPortfolioContextV3 = {
  currentPositionWeight?: number | null;
  sectorWeight?: number | null;
  correlatedExposureWeight?: number | null;
  maxPositionWeight?: number | null;
  maxSectorWeight?: number | null;
};

export type PersonalizationReasonCodeV3 =
  | "RISK_PROFILE_MATCH"
  | "RISK_PROFILE_MISMATCH"
  | "STYLE_MATCH"
  | "HORIZON_MATCH"
  | "POSITION_CONCENTRATION"
  | "SECTOR_CONCENTRATION"
  | "CORRELATED_EXPOSURE"
  | "LIMITED_PERSONAL_CONTEXT";

export type PersonalizationReasonV3 = {
  code: PersonalizationReasonCodeV3;
  direction: "positive" | "negative" | "neutral";
  detail: string;
};

export type PersonalizedRecommendationResultV3 = {
  mode: RecommendationViewModeV3;
  generalRating: RecommendationV3Rating;
  personalizedRating: RecommendationV3Rating;
  displayedRating: RecommendationV3Rating;
  fitScore: number;
  fitLabel: "STRONG_FIT" | "FIT" | "NEUTRAL" | "POOR_FIT";
  reasons: PersonalizationReasonV3[];
  disclosure: string;
};

export type PersonalizedRecommendationInputV3 = {
  mode?: RecommendationViewModeV3;
  profile?: PersonalizedInvestorProfileV3 | null;
  candidate?: PersonalizedCandidateSignalsV3 | null;
  portfolio?: PersonalizedPortfolioContextV3 | null;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const center = (value: number | null | undefined) => finite(value) ? value - 50 : 0;

function fitLabel(score: number): PersonalizedRecommendationResultV3["fitLabel"] {
  if (score >= 75) return "STRONG_FIT";
  if (score >= 60) return "FIT";
  if (score >= 45) return "NEUTRAL";
  return "POOR_FIT";
}

function profileFit(
  profile: PersonalizedInvestorProfileV3 | null | undefined,
  candidate: PersonalizedCandidateSignalsV3 | null | undefined,
  reasons: PersonalizationReasonV3[],
): number {
  if (!profile || !candidate) {
    reasons.push({
      code: "LIMITED_PERSONAL_CONTEXT",
      direction: "neutral",
      detail: "Investor-profile or candidate context is incomplete, so StockBox keeps personalization close to the objective view.",
    });
    return 50;
  }

  let score = 50;
  const risk = center(candidate.risk);
  const quality = center(candidate.quality);
  const growth = center(candidate.growth);
  const valuation = center(candidate.valuation);
  const momentum = center(candidate.momentum);

  if (profile.riskPreference === "defensive") {
    score += risk * 0.28 + quality * 0.18 - Math.max(0, -risk) * 0.12;
    reasons.push({
      code: risk >= 5 ? "RISK_PROFILE_MATCH" : "RISK_PROFILE_MISMATCH",
      direction: risk >= 5 ? "positive" : risk <= -5 ? "negative" : "neutral",
      detail: risk >= 5
        ? "The instrument's risk score fits a defensive investor profile."
        : "The instrument carries more modeled risk than a defensive profile normally targets.",
    });
  } else if (profile.riskPreference === "aggressive") {
    score += growth * 0.2 + momentum * 0.16 + risk * 0.04;
    reasons.push({
      code: "RISK_PROFILE_MATCH",
      direction: growth + momentum >= 10 ? "positive" : "neutral",
      detail: "Aggressive-profile fit emphasizes growth and momentum while still retaining the objective risk assessment.",
    });
  } else {
    score += risk * 0.12 + quality * 0.12 + growth * 0.08 + valuation * 0.06;
    reasons.push({
      code: risk >= -10 ? "RISK_PROFILE_MATCH" : "RISK_PROFILE_MISMATCH",
      direction: risk >= -10 ? "positive" : "negative",
      detail: "Balanced-profile fit weighs risk, quality, growth and valuation without overriding the objective recommendation.",
    });
  }

  if (profile.style === "growth") score += growth * 0.16 + momentum * 0.08;
  if (profile.style === "quality") score += quality * 0.2 + risk * 0.06;
  if (profile.style === "value") score += valuation * 0.2 + quality * 0.05;
  if (profile.style === "balanced") score += (quality + growth + valuation + risk) * 0.04;
  reasons.push({
    code: "STYLE_MATCH",
    direction: "neutral",
    detail: `The fit score incorporates the investor's ${profile.style} style without changing StockBox's general market view.`,
  });

  if (profile.horizon === "short") score += momentum * 0.12;
  if (profile.horizon === "long") score += quality * 0.08 + growth * 0.06 + risk * 0.04;
  reasons.push({
    code: "HORIZON_MATCH",
    direction: "neutral",
    detail: `Candidate factors are matched to the investor's ${profile.horizon}-term horizon as a separate suitability overlay.`,
  });

  return score;
}

function applyPortfolioFit(
  score: number,
  portfolio: PersonalizedPortfolioContextV3 | null | undefined,
  reasons: PersonalizationReasonV3[],
): number {
  if (!portfolio) return score;
  let adjusted = score;

  if (
    finite(portfolio.currentPositionWeight)
    && finite(portfolio.maxPositionWeight)
    && portfolio.maxPositionWeight > 0
    && portfolio.currentPositionWeight > portfolio.maxPositionWeight
  ) {
    const excess = portfolio.currentPositionWeight - portfolio.maxPositionWeight;
    adjusted -= Math.min(28, excess * 180);
    reasons.push({
      code: "POSITION_CONCENTRATION",
      direction: "negative",
      detail: "The existing position is above the user's selected maximum position weight.",
    });
  }

  if (
    finite(portfolio.sectorWeight)
    && finite(portfolio.maxSectorWeight)
    && portfolio.maxSectorWeight > 0
    && portfolio.sectorWeight > portfolio.maxSectorWeight
  ) {
    const excess = portfolio.sectorWeight - portfolio.maxSectorWeight;
    adjusted -= Math.min(30, excess * 140);
    reasons.push({
      code: "SECTOR_CONCENTRATION",
      direction: "negative",
      detail: "Buying more would increase exposure to a sector that is already above the user's selected concentration limit.",
    });
  }

  if (finite(portfolio.correlatedExposureWeight) && portfolio.correlatedExposureWeight > 0.45) {
    adjusted -= Math.min(22, (portfolio.correlatedExposureWeight - 0.45) * 80 + 6);
    reasons.push({
      code: "CORRELATED_EXPOSURE",
      direction: "negative",
      detail: "The portfolio already has substantial correlated exposure, reducing the incremental diversification benefit.",
    });
  }

  return adjusted;
}

function personalizedRating(
  objective: RecommendationV3Rating,
  fitScore: number,
  portfolio: PersonalizedPortfolioContextV3 | null | undefined,
): RecommendationV3Rating {
  // Personal preferences and portfolio context are never allowed to turn a
  // negative objective StockBox view into a positive recommendation.
  if (["SELL", "REDUCE", "UNAVAILABLE"].includes(objective)) return objective;

  if (objective === "STRONG_BUY") {
    if (fitScore < 35) return finite(portfolio?.currentPositionWeight) && (portfolio?.currentPositionWeight ?? 0) > 0 ? "HOLD" : "WAIT";
    if (fitScore < 55) return "WAIT";
    if (fitScore < 68) return "BUY";
    return objective;
  }

  if (objective === "BUY") {
    if (fitScore < 35) return finite(portfolio?.currentPositionWeight) && (portfolio?.currentPositionWeight ?? 0) > 0 ? "HOLD" : "WAIT";
    if (fitScore < 50) return "WAIT";
    return objective;
  }

  if (objective === "HOLD" && fitScore < 35) return "WAIT";
  return objective;
}

export function derivePersonalizedRecommendationV3(
  objective: RecommendationDecisionV3,
  input: PersonalizedRecommendationInputV3 = {},
): PersonalizedRecommendationResultV3 {
  const reasons: PersonalizationReasonV3[] = [];
  const rawFit = profileFit(input.profile, input.candidate, reasons);
  const fitScore = Math.round(clamp(applyPortfolioFit(rawFit, input.portfolio, reasons), 0, 100));
  const personalized = personalizedRating(objective.rating, fitScore, input.portfolio);
  const mode = input.mode ?? "general";

  return {
    mode,
    generalRating: objective.rating,
    personalizedRating: personalized,
    displayedRating: mode === "personalized" ? personalized : objective.rating,
    fitScore,
    fitLabel: fitLabel(fitScore),
    reasons,
    disclosure:
      "The General rating is StockBox's objective model view. For You is a separate suitability overlay using supplied preferences and portfolio context; it never improves an objectively negative StockBox rating and is not a guarantee of suitability or return.",
  };
}
