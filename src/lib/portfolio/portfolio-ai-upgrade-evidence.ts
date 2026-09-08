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
