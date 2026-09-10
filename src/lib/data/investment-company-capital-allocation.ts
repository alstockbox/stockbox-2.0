import type { InvestmentCompanyKeyRatioYear } from "@/lib/data/official-investment-company-key-ratios";

const REQUIRED_SCORING_YEARS = 5;
const MIN_MATERIAL_DEPLOYMENT_YEARS = 3;
const MATERIAL_DEPLOYMENT_NAV_RATIO = 0.01;
const MATERIAL_SHARE_ISSUANCE_RATIO = 0.01;
const FULL_RELATIVE_OUTPERFORMANCE_CAGR = 0.08;
const FULL_RELATIVE_UNDERPERFORMANCE_CAGR = -0.08;
const FULL_FUNDING_PENALTY_DEBT_RATIO_INCREASE = 0.10;

type CapitalAllocationFailureReason =
  | "insufficient_consecutive_history"
  | "incomplete_benchmark_history"
  | "invalid_return_history"
  | "incomplete_funding_history"
  | "insufficient_material_deployment_history"
  | "share_issuance_terms_unverified";

export type InvestmentCompanyCapitalAllocation = {
  score: number | null;
  reason: CapitalAllocationFailureReason | null;
  yearsUsed: number[];
  deploymentYears: number[];
  relativePortfolioCagr: number | null;
  portfolioOutcomeScore: number | null;
  fundingDisciplineScore: number | null;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function failure(
  reason: CapitalAllocationFailureReason,
  yearsUsed: number[] = [],
  deploymentYears: number[] = [],
): InvestmentCompanyCapitalAllocation {
  return {
    score: null,
    reason,
    yearsUsed,
    deploymentYears,
    relativePortfolioCagr: null,
    portfolioOutcomeScore: null,
    fundingDisciplineScore: null,
  };
}

function hasCompleteBenchmark(point: InvestmentCompanyKeyRatioYear): boolean {
  return typeof point.benchmarkReturnSixrx === "number"
    && Number.isFinite(point.benchmarkReturnSixrx);
}

function hasValidReturnHistory(point: InvestmentCompanyKeyRatioYear): boolean {
  return Number.isFinite(point.portfolioReturn)
    && point.portfolioReturn > -1
    && hasCompleteBenchmark(point)
    && (point.benchmarkReturnSixrx as number) > -1;
}

function hasCompleteFundingEvidence(point: InvestmentCompanyKeyRatioYear): boolean {
  return Number.isFinite(point.netPurchasesSales)
    && Number.isFinite(point.netDebt)
    && Number.isFinite(point.debtEquitiesRatio)
    && point.debtEquitiesRatio >= 0
    && Number.isFinite(point.navPerShare)
    && point.navPerShare > 0
    && Number.isFinite(point.sharesOutstanding)
    && point.sharesOutstanding > 0;
}

function isMaterialPositiveDeployment(point: InvestmentCompanyKeyRatioYear): boolean {
  if (!hasCompleteFundingEvidence(point) || point.netPurchasesSales <= 0) return false;

  const navEstimate = point.navPerShare * point.sharesOutstanding;
  if (!Number.isFinite(navEstimate) || navEstimate <= 0) return false;

  return point.netPurchasesSales / navEstimate >= MATERIAL_DEPLOYMENT_NAV_RATIO;
}

function portfolioOutcomeScore(relativePortfolioCagr: number): number {
  if (relativePortfolioCagr <= FULL_RELATIVE_UNDERPERFORMANCE_CAGR) return 0;
  if (relativePortfolioCagr >= FULL_RELATIVE_OUTPERFORMANCE_CAGR) return 100;

  return clampScore(
    50 + (relativePortfolioCagr / FULL_RELATIVE_OUTPERFORMANCE_CAGR) * 50,
  );
}

function fundingDisciplineScore(
  deploymentYears: InvestmentCompanyKeyRatioYear[],
  byYear: Map<number, InvestmentCompanyKeyRatioYear>,
): number | null {
  const increases: number[] = [];

  for (const current of deploymentYears) {
    const previous = byYear.get(current.year - 1);
    if (!previous || !hasCompleteFundingEvidence(previous)) return null;

    // Capital allocation uses the change in debt funding during deployment, not the
    // absolute leverage level, so the dedicated leverage factor remains distinct.
    increases.push(Math.max(0, current.debtEquitiesRatio - previous.debtEquitiesRatio));
  }

  if (!increases.length) return null;
  const averageIncrease = increases.reduce((sum, value) => sum + value, 0) / increases.length;

  return clampScore(
    100 * (1 - averageIncrease / FULL_FUNDING_PENALTY_DEBT_RATIO_INCREASE),
  );
}

export function deriveInvestmentCompanyCapitalAllocation(
  history: InvestmentCompanyKeyRatioYear[] | null | undefined,
): InvestmentCompanyCapitalAllocation {
  const ordered = [...(history ?? [])]
    .filter((point) => Number.isInteger(point.year))
    .sort((left, right) => right.year - left.year);

  if (ordered.length < REQUIRED_SCORING_YEARS) {
    return failure("insufficient_consecutive_history");
  }

  const selected = ordered.slice(0, REQUIRED_SCORING_YEARS);
  const yearsUsed = selected.map((point) => point.year);
  const uniqueYears = new Set(yearsUsed);
  const consecutive = uniqueYears.size === REQUIRED_SCORING_YEARS
    && yearsUsed.every((year, index) => index === 0 || year === yearsUsed[index - 1] - 1);

  if (!consecutive) {
    return failure("insufficient_consecutive_history", yearsUsed);
  }

  if (!selected.every(hasCompleteBenchmark)) {
    return failure("incomplete_benchmark_history", yearsUsed);
  }

  if (!selected.every(hasValidReturnHistory)) {
    return failure("invalid_return_history", yearsUsed);
  }

  if (!selected.every(hasCompleteFundingEvidence)) {
    return failure("incomplete_funding_history", yearsUsed);
  }

  const deploymentPoints = selected.filter(isMaterialPositiveDeployment);
  const deploymentYears = deploymentPoints.map((point) => point.year);

  if (deploymentPoints.length < MIN_MATERIAL_DEPLOYMENT_YEARS) {
    return failure(
      "insufficient_material_deployment_history",
      yearsUsed,
      deploymentYears,
    );
  }

  const byYear = new Map(ordered.map((point) => [point.year, point]));
  for (const current of selected) {
    const previous = byYear.get(current.year - 1);
    if (!previous || !hasCompleteFundingEvidence(previous)) continue;

    const shareGrowth = current.sharesOutstanding / previous.sharesOutstanding - 1;
    if (Number.isFinite(shareGrowth) && shareGrowth > MATERIAL_SHARE_ISSUANCE_RATIO) {
      return failure("share_issuance_terms_unverified", yearsUsed, deploymentYears);
    }
  }

  let relativeGrowth = 1;
  for (const point of selected) {
    relativeGrowth *= (1 + point.portfolioReturn) / (1 + (point.benchmarkReturnSixrx as number));
  }

  const relativePortfolioCagr = relativeGrowth ** (1 / REQUIRED_SCORING_YEARS) - 1;
  if (!Number.isFinite(relativePortfolioCagr)) {
    return failure("invalid_return_history", yearsUsed, deploymentYears);
  }

  const outcomeScore = portfolioOutcomeScore(relativePortfolioCagr);
  const fundingScore = fundingDisciplineScore(deploymentPoints, byYear);
  if (fundingScore === null) {
    return failure("incomplete_funding_history", yearsUsed, deploymentYears);
  }

  const score = clampScore(outcomeScore * 0.6 + fundingScore * 0.4);

  return {
    score,
    reason: null,
    yearsUsed,
    deploymentYears,
    relativePortfolioCagr,
    portfolioOutcomeScore: outcomeScore,
    fundingDisciplineScore: fundingScore,
  };
}
