import { SCORE_COVERAGE_POLICY, weightsForSectorAndProfile } from "./config";
import type {
  AnalysisReport,
  InvestmentProfile,
  ScoreDimension,
  ScoreDimensionKey,
  Sector,
} from "./types";

export const ANALYSIS_LENS_PROFILES: readonly InvestmentProfile[] = [
  "balanced",
  "long_term",
  "short_term",
  "growth",
  "value",
  "quality",
  "dividend",
  "defensive",
] as const;

const SCORE_DIMENSION_KEYS: readonly ScoreDimensionKey[] = [
  "growth",
  "profitability",
  "financialHealth",
  "valuation",
  "cashFlow",
  "earningsQuality",
  "quality",
  "momentum",
  "risk",
] as const;

function isFiniteScore(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function dimensionIsApplicable(dimension: ScoreDimension | undefined) {
  if (!dimension) return false;
  if (typeof dimension.plannedWeight === "number") return dimension.plannedWeight > 0;
  if (dimension.contributors?.length) {
    return dimension.contributors.some((contributor) => contributor.availability !== "unsuitable");
  }
  return isFiniteScore(dimension.score);
}

function dimensionCoverage(dimension: ScoreDimension | undefined) {
  if (!dimension) return 0;
  if (typeof dimension.coverage === "number" && Number.isFinite(dimension.coverage)) {
    return clamp(dimension.coverage, 0, 1);
  }
  return isFiniteScore(dimension.score) ? 1 : 0;
}

export function personalizedScoreForLens(
  dimensions: readonly ScoreDimension[],
  sector: Sector | undefined,
  profile: InvestmentProfile,
): number | null {
  const dimensionByKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const weights = weightsForSectorAndProfile(sector, profile);
  const applicable = SCORE_DIMENSION_KEYS.filter((key) => dimensionIsApplicable(dimensionByKey.get(key)));
  const applicableWeight = applicable.reduce((sum, key) => sum + weights[key], 0);
  if (applicableWeight <= 0) return null;

  const coverage = applicable.reduce(
    (sum, key) => sum + dimensionCoverage(dimensionByKey.get(key)) * weights[key],
    0,
  ) / applicableWeight;

  const available = applicable.filter((key) => isFiniteScore(dimensionByKey.get(key)?.score));
  const availableWeight = available.reduce((sum, key) => sum + weights[key], 0);
  if (availableWeight <= 0 || coverage < SCORE_COVERAGE_POLICY.overallMinimum) return null;

  const rawScore = available.reduce(
    (sum, key) => sum + (dimensionByKey.get(key)?.score as number) * weights[key],
    0,
  ) / availableWeight;
  const adjustedScore = clamp(50 + (rawScore - 50) * coverage, 0, 100);
  return Math.round(adjustedScore * 10) / 10;
}

export function applyAnalysisLens(report: AnalysisReport, profile: InvestmentProfile): AnalysisReport {
  const sector = report.engine?.scores.sector;
  const personalizedScore = report.score.score === null
    ? null
    : personalizedScoreForLens(report.score.dimensions, sector, profile);
  const personalizedWeights = sector
    ? weightsForSectorAndProfile(sector, profile)
    : report.engine?.scores.methodology.personalizedWeights;

  return {
    ...report,
    investmentProfile: profile,
    score: {
      ...report.score,
      personalizedScore,
      // Dimensions are canonical facts produced by the engine. A temporary lens only reweights them.
      dimensions: report.score.dimensions,
    },
    engine: report.engine
      ? {
          ...report.engine,
          scores: {
            ...report.engine.scores,
            personalizedScore,
            investmentProfile: profile,
            dimensions: report.engine.scores.dimensions,
            methodology: {
              ...report.engine.scores.methodology,
              personalizedWeights: personalizedWeights ?? report.engine.scores.methodology.personalizedWeights,
            },
          },
        }
      : report.engine,
  };
}
