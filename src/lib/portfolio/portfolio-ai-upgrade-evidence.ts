import type {
  Horizon,
  PortfolioAiCandidate,
  PortfolioStyle,
  PortfolioUpgradeDriverDimension,
  RiskPreference,
} from "./portfolio-ai-planner";

export type PortfolioUpgradeEvidenceItem = {
  dimension: PortfolioUpgradeDriverDimension;
  weakValue: number;
  candidateValue: number;
  delta: number;
  relevanceWeight: number;
};

export type PortfolioUpgradeEvidenceComparison = {
  comparableDimensions: number;
  strengths: PortfolioUpgradeEvidenceItem[];
  tradeoffs: PortfolioUpgradeEvidenceItem[];
};

export type PortfolioUpgradeNetCaseLabel = "strong_improvement" | "mixed" | "marginal" | "insufficient";

export type PortfolioUpgradeNetCase = {
  label: PortfolioUpgradeNetCaseLabel;
  positiveEvidence: number;
  negativeEvidence: number;
  netEvidence: number | null;
  comparableDimensions: number;
};

export type PortfolioUpgradeRankOption = {
  ticker: string;
  profileRank: number;
  scoreImprovement: number;
  netCase: PortfolioUpgradeNetCase;
};

export type PortfolioUpgradeEvidenceSummary = {
  primaryStrength: PortfolioUpgradeEvidenceItem | null;
  primaryTradeoff: PortfolioUpgradeEvidenceItem | null;
};

function relevanceWeight(
  dimension: PortfolioUpgradeDriverDimension,
  risk: RiskPreference,
  style: PortfolioStyle,
  horizon: Horizon,
) {
  let weight = 1;
  if (dimension === "quality") {
    if (style === "quality") weight += 1.2;
    if (risk === "defensive") weight += 0.4;
    if (horizon === "long") weight += 0.3;
  }
  if (dimension === "risk") {
    if (risk === "defensive") weight += 1.1;
    if (style === "quality") weight += 0.3;
  }
  if (dimension === "growth") {
    if (style === "growth") weight += 1.4;
    if (risk === "aggressive") weight += 0.4;
    if (horizon === "long") weight += 0.3;
  }
  if (dimension === "valuation" && style === "value") weight += 1.5;
  if (dimension === "momentum") {
    if (horizon === "short") weight += 1.4;
    if (risk === "aggressive") weight += 0.5;
    if (style === "growth") weight += 0.5;
  }
  return weight;
}

export function comparePortfolioUpgradeEvidence({
  weakCandidate,
  upgradeCandidate,
  risk,
  style,
  horizon,
  strengthLimit = 3,
  tradeoffLimit = 2,
}: {
  weakCandidate: PortfolioAiCandidate;
  upgradeCandidate: PortfolioAiCandidate;
  risk: RiskPreference;
  style: PortfolioStyle;
  horizon: Horizon;
  strengthLimit?: number;
  tradeoffLimit?: number;
}): PortfolioUpgradeEvidenceComparison {
  const dimensions: PortfolioUpgradeDriverDimension[] = [
    "quality",
    "risk",
    "growth",
    "valuation",
    "momentum",
  ];
  const normalizedStrengthLimit = Number.isFinite(strengthLimit)
    ? Math.max(0, Math.floor(strengthLimit))
    : 3;
  const normalizedTradeoffLimit = Number.isFinite(tradeoffLimit)
    ? Math.max(0, Math.floor(tradeoffLimit))
    : 2;

  const comparable = dimensions.flatMap((dimension) => {
    const weakValue = weakCandidate[dimension];
    const candidateValue = upgradeCandidate[dimension];
    if (typeof weakValue !== "number" || !Number.isFinite(weakValue)) return [];
    if (typeof candidateValue !== "number" || !Number.isFinite(candidateValue)) return [];
    return [{
      dimension,
      weakValue,
      candidateValue,
      delta: candidateValue - weakValue,
      relevanceWeight: relevanceWeight(dimension, risk, style, horizon),
    }];
  });

  const strengths = comparable
    .filter((item) => item.delta > 0)
    .sort((a, b) => (b.delta * b.relevanceWeight) - (a.delta * a.relevanceWeight))
    .slice(0, normalizedStrengthLimit);

  const tradeoffs = comparable
    .filter((item) => item.delta < 0)
    .sort((a, b) => (Math.abs(b.delta) * b.relevanceWeight) - (Math.abs(a.delta) * a.relevanceWeight))
    .slice(0, normalizedTradeoffLimit);

  return {
    comparableDimensions: comparable.length,
    strengths,
    tradeoffs,
  };
}

export function classifyPortfolioUpgradeNetCase(
  comparison: PortfolioUpgradeEvidenceComparison,
): PortfolioUpgradeNetCase {
  const positiveEvidence = comparison.strengths.reduce(
    (sum, item) => sum + Math.max(0, item.delta) * item.relevanceWeight,
    0,
  );
  const negativeEvidence = comparison.tradeoffs.reduce(
    (sum, item) => sum + Math.abs(Math.min(0, item.delta)) * item.relevanceWeight,
    0,
  );

  if (comparison.comparableDimensions < 2) {
    return {
      label: "insufficient",
      positiveEvidence,
      negativeEvidence,
      netEvidence: null,
      comparableDimensions: comparison.comparableDimensions,
    };
  }

  const netEvidence = positiveEvidence - negativeEvidence;
  const totalEvidence = positiveEvidence + negativeEvidence;
  let label: PortfolioUpgradeNetCaseLabel = "marginal";

  if (positiveEvidence >= 20 && netEvidence >= 15 && positiveEvidence >= negativeEvidence * 2) {
    label = "strong_improvement";
  } else if (totalEvidence >= 15 && positiveEvidence > 0 && negativeEvidence > 0) {
    label = "mixed";
  }

  return {
    label,
    positiveEvidence,
    negativeEvidence,
    netEvidence,
    comparableDimensions: comparison.comparableDimensions,
  };
}

export function rankPortfolioUpgradeOptions<T extends PortfolioUpgradeRankOption>(options: T[]): T[] {
  const labelPriority: Record<PortfolioUpgradeNetCaseLabel, number> = {
    strong_improvement: 0,
    mixed: 1,
    marginal: 2,
    insufficient: 3,
  };

  return [...options].sort((a, b) => {
    const labelDifference = labelPriority[a.netCase.label] - labelPriority[b.netCase.label];
    if (labelDifference !== 0) return labelDifference;

    const aProfileRank = Number.isFinite(a.profileRank) ? a.profileRank : Number.POSITIVE_INFINITY;
    const bProfileRank = Number.isFinite(b.profileRank) ? b.profileRank : Number.POSITIVE_INFINITY;
    if (aProfileRank !== bProfileRank) return aProfileRank - bProfileRank;

    const aNetEvidence = a.netCase.netEvidence ?? Number.NEGATIVE_INFINITY;
    const bNetEvidence = b.netCase.netEvidence ?? Number.NEGATIVE_INFINITY;
    if (aNetEvidence !== bNetEvidence) return bNetEvidence - aNetEvidence;

    const aScoreImprovement = Number.isFinite(a.scoreImprovement) ? a.scoreImprovement : Number.NEGATIVE_INFINITY;
    const bScoreImprovement = Number.isFinite(b.scoreImprovement) ? b.scoreImprovement : Number.NEGATIVE_INFINITY;
    if (aScoreImprovement !== bScoreImprovement) return bScoreImprovement - aScoreImprovement;

    return a.ticker.localeCompare(b.ticker);
  });
}

export function summarizePortfolioUpgradeEvidence(
  comparison: PortfolioUpgradeEvidenceComparison,
): PortfolioUpgradeEvidenceSummary {
  if (comparison.comparableDimensions < 2) {
    return { primaryStrength: null, primaryTradeoff: null };
  }

  return {
    primaryStrength: comparison.strengths[0] ?? null,
    primaryTradeoff: comparison.tradeoffs[0] ?? null,
  };
}
