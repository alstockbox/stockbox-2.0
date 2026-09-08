export type RiskPreference = "defensive" | "balanced" | "aggressive";
export type Horizon = "short" | "medium" | "long";
export type PortfolioStyle = "balanced" | "growth" | "quality" | "value";
export type PortfolioBreadth = "focused" | "balanced" | "broad";

export type PortfolioAiCandidate = {
  ticker: string;
  name: string;
  score: number | null;
  recommendation: string | null;
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  risk: number | null;
  momentum: number | null;
  analyzedAt?: string | null;
};

export type PortfolioDataQuality = {
  status: "good" | "stale" | "insufficient";
  totalQualifying: number;
  freshCount: number;
  staleTickers: string[];
  recommendedAdditionalAnalyses: number;
};

export type PortfolioAllocationItem = PortfolioAiCandidate & {
  rank: number;
  targetInvestedWeight: number;
  targetPortfolioWeight: number;
  targetAmount: number;
};

export type PortfolioPlan = {
  allocation: PortfolioAllocationItem[];
  budget: number;
  cashReservePercent: number;
  cashReserveAmount: number;
  investableAmount: number;
  investableShare: number;
  requestedMaxPositionWeight: number;
  effectiveMaxPositionWeight: number;
  desiredHoldingCount: number;
  capRelaxed: boolean;
  dataQuality: PortfolioDataQuality;
};

export type PortfolioSnapshotSignal = {
  portfolioScore: number | null;
  riskScore: number | null;
  diversificationScore: number | null;
  unrealizedProfitLoss: number | null;
  portfolioValue: number | null;
  largestPositionWeight: number | null;
};

export type PortfolioSnapshotDelta = {
  portfolioScore: number | null;
  riskScore: number | null;
  diversificationScore: number | null;
  unrealizedProfitLoss: number | null;
  portfolioValue: number | null;
  largestPositionWeight: number | null;
};

export type RebalanceCurrentHolding = {
  ticker: string;
  currentWeight: number;
};

export type RebalanceTargetHolding = {
  ticker: string;
  targetPortfolioWeight: number;
};

export type RebalanceItem = {
  ticker: string;
  currentWeight: number;
  targetPortfolioWeight: number;
  deltaWeight: number;
};

export type PortfolioUpgradeCandidate = PortfolioAiCandidate & {
  profileRank: number;
  scoreImprovement: number;
};

export type PortfolioUpgradeDriverDimension = "quality" | "risk" | "growth" | "valuation" | "momentum";

export type PortfolioUpgradeDriver = {
  dimension: PortfolioUpgradeDriverDimension;
  weakValue: number;
  candidateValue: number;
  improvement: number;
  relevanceWeight: number;
};

export type PortfolioActionCode =
  | "negative_signal"
  | "concentration"
  | "risk_mismatch"
  | "weak_holding"
  | "diversification"
  | "stale_data"
  | "portfolio_score"
  | "healthy";

export type PortfolioAction = {
  priority: "high" | "medium" | "low" | "positive";
  code: PortfolioActionCode;
  ticker?: string;
  recommendation?: string | null;
  currentValue?: number | null;
  targetValue?: number | null;
  count?: number;
};

const recommendationAdjustment: Record<string, number> = {
  "Strong Buy": 10,
  Buy: 6,
  Hold: 0,
  Sell: -28,
  "Strong Sell": -45,
  "No Rating": -8,
};

function finite(value: number | null | undefined, fallback = 50) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isQualifyingCandidate(candidate: PortfolioAiCandidate) {
  return candidate.score !== null
    && Number.isFinite(candidate.score)
    && !["Sell", "Strong Sell"].includes(candidate.recommendation ?? "");
}

function isFreshCandidate(candidate: PortfolioAiCandidate, nowMs: number, staleAfterDays: number) {
  const analyzedAt = validDate(candidate.analyzedAt);
  if (analyzedAt === null) return false;
  const ageMs = Math.max(0, nowMs - analyzedAt);
  return ageMs <= staleAfterDays * 24 * 60 * 60 * 1000;
}

export function candidateRank(
  candidate: PortfolioAiCandidate,
  risk: RiskPreference,
  style: PortfolioStyle,
  horizon: Horizon,
) {
  const overall = finite(candidate.score);
  const valuation = finite(candidate.valuation);
  const growth = finite(candidate.growth);
  const quality = finite(candidate.quality);
  const riskScore = finite(candidate.risk);
  const momentum = finite(candidate.momentum);
  let rank = overall * 0.42
    + quality * 0.14
    + riskScore * 0.1
    + valuation * 0.1
    + growth * 0.14
    + momentum * 0.1;

  if (style === "growth") rank += growth * 0.18 + momentum * 0.08 - valuation * 0.04;
  if (style === "quality") rank += quality * 0.2 + riskScore * 0.08;
  if (style === "value") rank += valuation * 0.22 + quality * 0.06;
  if (risk === "defensive") rank += riskScore * 0.16 + quality * 0.08 - momentum * 0.03;
  if (risk === "aggressive") rank += growth * 0.1 + momentum * 0.12;
  if (horizon === "long") rank += quality * 0.07 + growth * 0.05;
  if (horizon === "short") rank += momentum * 0.1;
  rank += recommendationAdjustment[candidate.recommendation ?? "No Rating"] ?? 0;
  return rank;
}

export function targetHoldingCount(breadth: PortfolioBreadth) {
  return breadth === "focused" ? 6 : breadth === "broad" ? 14 : 10;
}

export function targetMaxPositionWeight(risk: RiskPreference, breadth: PortfolioBreadth) {
  const breadthCap = breadth === "focused" ? 0.22 : breadth === "broad" ? 0.1 : 0.15;
  if (risk === "defensive") return Math.min(breadthCap, 0.12);
  if (risk === "aggressive") return Math.min(0.25, breadthCap + 0.04);
  return breadthCap;
}

function buildInvestedWeights(count: number, maxInvestedWeight: number) {
  if (count <= 0) return [];
  const feasibleCap = Math.max(maxInvestedWeight, 1 / count);
  const raw = Array.from({ length: count }, (_, index) => Math.max(1, count - index * 0.28));
  const rawTotal = raw.reduce((sum, value) => sum + value, 0);
  let weights = raw.map((value) => value / rawTotal);

  for (let pass = 0; pass < count + 2; pass += 1) {
    const excess = weights.reduce((sum, weight) => sum + Math.max(0, weight - feasibleCap), 0);
    weights = weights.map((weight) => Math.min(weight, feasibleCap));
    if (excess < 0.000001) break;

    const eligible = weights
      .map((weight, index) => ({ weight, index }))
      .filter((item) => item.weight < feasibleCap - 0.000001);
    if (!eligible.length) break;
    const room = eligible.reduce((sum, item) => sum + (feasibleCap - item.weight), 0);
    if (room <= 0) break;
    for (const item of eligible) {
      weights[item.index] += excess * ((feasibleCap - item.weight) / room);
    }
  }

  const total = weights.reduce((sum, value) => sum + value, 0);
  return total > 0 ? weights.map((weight) => weight / total) : [];
}

export function assessPortfolioDataQuality({
  candidates,
  requiredCount,
  now,
  staleAfterDays = 45,
}: {
  candidates: PortfolioAiCandidate[];
  requiredCount: number;
  now?: string | Date;
  staleAfterDays?: number;
}): PortfolioDataQuality {
  const nowDate = now instanceof Date ? now : new Date(now ?? Date.now());
  const nowMs = Number.isFinite(nowDate.getTime()) ? nowDate.getTime() : Date.now();
  const qualifying = candidates.filter(isQualifyingCandidate);
  const fresh = qualifying.filter((candidate) => isFreshCandidate(candidate, nowMs, staleAfterDays));
  const staleTickers = qualifying
    .filter((candidate) => !isFreshCandidate(candidate, nowMs, staleAfterDays))
    .map((candidate) => candidate.ticker);
  const normalizedRequired = Math.max(0, Math.floor(requiredCount));
  const recommendedAdditionalAnalyses = Math.max(0, normalizedRequired - fresh.length);
  const status: PortfolioDataQuality["status"] = qualifying.length < normalizedRequired
    ? "insufficient"
    : fresh.length < normalizedRequired
      ? "stale"
      : "good";

  return {
    status,
    totalQualifying: qualifying.length,
    freshCount: fresh.length,
    staleTickers,
    recommendedAdditionalAnalyses,
  };
}

export function createPortfolioPlan({
  candidates,
  budget,
  cashReservePercent,
  risk,
  horizon,
  style,
  breadth,
  now,
  staleAfterDays = 45,
}: {
  candidates: PortfolioAiCandidate[];
  budget: number;
  cashReservePercent: number;
  risk: RiskPreference;
  horizon: Horizon;
  style: PortfolioStyle;
  breadth: PortfolioBreadth;
  now?: string | Date;
  staleAfterDays?: number;
}): PortfolioPlan {
  const normalizedBudget = Number.isFinite(budget) ? Math.max(0, budget) : 0;
  const normalizedCashReservePercent = Number.isFinite(cashReservePercent)
    ? clamp(cashReservePercent, 0, 80)
    : 0;
  const cashReserveFraction = normalizedCashReservePercent / 100;
  const investableShare = 1 - cashReserveFraction;
  const cashReserveAmount = normalizedBudget * cashReserveFraction;
  const investableAmount = normalizedBudget - cashReserveAmount;
  const requestedMaxPositionWeight = targetMaxPositionWeight(risk, breadth);
  const minimumCountForCap = investableShare > 0
    ? Math.ceil(investableShare / requestedMaxPositionWeight)
    : 0;
  const desiredHoldingCount = Math.max(targetHoldingCount(breadth), minimumCountForCap);
  const dataQuality = assessPortfolioDataQuality({
    candidates,
    requiredCount: desiredHoldingCount,
    now,
    staleAfterDays,
  });
  const nowDate = now instanceof Date ? now : new Date(now ?? Date.now());
  const nowMs = Number.isFinite(nowDate.getTime()) ? nowDate.getTime() : Date.now();
  const rankedCandidates = candidates
    .filter(isQualifyingCandidate)
    .filter((candidate) => isFreshCandidate(candidate, nowMs, staleAfterDays))
    .map((candidate) => ({ ...candidate, rank: candidateRank(candidate, risk, style, horizon) }))
    .sort((a, b) => b.rank - a.rank);
  const chosen = rankedCandidates.slice(0, Math.min(desiredHoldingCount, rankedCandidates.length));
  const effectiveMaxPositionWeight = chosen.length
    ? Math.max(requestedMaxPositionWeight, investableShare / chosen.length)
    : requestedMaxPositionWeight;
  const maxInvestedWeight = investableShare > 0
    ? Math.min(1, effectiveMaxPositionWeight / investableShare)
    : 1;
  const investedWeights = buildInvestedWeights(chosen.length, maxInvestedWeight);
  const allocation = chosen.map((candidate, index) => {
    const targetInvestedWeight = investedWeights[index] ?? 0;
    const targetPortfolioWeight = targetInvestedWeight * investableShare;
    return {
      ...candidate,
      targetInvestedWeight,
      targetPortfolioWeight,
      targetAmount: normalizedBudget * targetPortfolioWeight,
    };
  });

  return {
    allocation,
    budget: normalizedBudget,
    cashReservePercent: normalizedCashReservePercent,
    cashReserveAmount,
    investableAmount,
    investableShare,
    requestedMaxPositionWeight,
    effectiveMaxPositionWeight,
    desiredHoldingCount,
    capRelaxed: effectiveMaxPositionWeight > requestedMaxPositionWeight + 0.000001,
    dataQuality,
  };
}

function delta(current: number | null, previous: number | null) {
  return typeof current === "number" && Number.isFinite(current)
    && typeof previous === "number" && Number.isFinite(previous)
    ? current - previous
    : null;
}

export function comparePortfolioSnapshots(
  current: PortfolioSnapshotSignal | null | undefined,
  previous: PortfolioSnapshotSignal | null | undefined,
): PortfolioSnapshotDelta | null {
  if (!current || !previous) return null;
  return {
    portfolioScore: delta(current.portfolioScore, previous.portfolioScore),
    riskScore: delta(current.riskScore, previous.riskScore),
    diversificationScore: delta(current.diversificationScore, previous.diversificationScore),
    unrealizedProfitLoss: delta(current.unrealizedProfitLoss, previous.unrealizedProfitLoss),
    portfolioValue: delta(current.portfolioValue, previous.portfolioValue),
    largestPositionWeight: delta(current.largestPositionWeight, previous.largestPositionWeight),
  };
}

export function buildRebalancePlan(
  current: RebalanceCurrentHolding[],
  target: RebalanceTargetHolding[],
): RebalanceItem[] {
  const currentMap = new Map(current.map((item) => [item.ticker.trim().toUpperCase(), item.currentWeight]));
  const targetMap = new Map(target.map((item) => [item.ticker.trim().toUpperCase(), item.targetPortfolioWeight]));
  const tickers = [...new Set([...currentMap.keys(), ...targetMap.keys()])];
  return tickers
    .map((ticker) => {
      const currentWeight = currentMap.get(ticker) ?? 0;
      const targetPortfolioWeight = targetMap.get(ticker) ?? 0;
      return {
        ticker,
        currentWeight,
        targetPortfolioWeight,
        deltaWeight: targetPortfolioWeight - currentWeight,
      };
    })
    .sort((a, b) => Math.abs(b.deltaWeight) - Math.abs(a.deltaWeight));
}

export function findPortfolioUpgradeCandidates({
  weakHolding,
  currentHoldingTickers,
  candidates,
  risk,
  style,
  horizon,
  now,
  staleAfterDays = 45,
  minimumScoreImprovement = 8,
  limit = 3,
}: {
  weakHolding: { ticker: string; score: number | null };
  currentHoldingTickers: string[];
  candidates: PortfolioAiCandidate[];
  risk: RiskPreference;
  style: PortfolioStyle;
  horizon: Horizon;
  now?: string | Date;
  staleAfterDays?: number;
  minimumScoreImprovement?: number;
  limit?: number;
}): PortfolioUpgradeCandidate[] {
  const nowDate = now instanceof Date ? now : new Date(now ?? Date.now());
  const nowMs = Number.isFinite(nowDate.getTime()) ? nowDate.getTime() : Date.now();
  const weakScore = typeof weakHolding.score === "number" && Number.isFinite(weakHolding.score)
    ? weakHolding.score
    : null;
  if (weakScore === null) return [];

  const excluded = new Set([
    weakHolding.ticker,
    ...currentHoldingTickers,
  ].map((ticker) => ticker.trim().toUpperCase()).filter(Boolean));
  const minimumImprovement = Number.isFinite(minimumScoreImprovement)
    ? Math.max(0, minimumScoreImprovement)
    : 8;
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3;

  return candidates
    .filter(isQualifyingCandidate)
    .filter((candidate) => isFreshCandidate(candidate, nowMs, staleAfterDays))
    .filter((candidate) => !excluded.has(candidate.ticker.trim().toUpperCase()))
    .filter((candidate) => finite(candidate.score, weakScore) - weakScore >= minimumImprovement)
    .map((candidate) => ({
      ...candidate,
      profileRank: candidateRank(candidate, risk, style, horizon),
      scoreImprovement: finite(candidate.score, weakScore) - weakScore,
    }))
    .sort((a, b) => b.profileRank - a.profileRank || b.scoreImprovement - a.scoreImprovement)
    .slice(0, normalizedLimit);
}

function driverRelevance(
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

export function buildPortfolioUpgradeDrivers({
  weakCandidate,
  upgradeCandidate,
  risk,
  style,
  horizon,
  limit = 3,
}: {
  weakCandidate: PortfolioAiCandidate;
  upgradeCandidate: PortfolioAiCandidate;
  risk: RiskPreference;
  style: PortfolioStyle;
  horizon: Horizon;
  limit?: number;
}): PortfolioUpgradeDriver[] {
  const dimensions: PortfolioUpgradeDriverDimension[] = ["quality", "risk", "growth", "valuation", "momentum"];
  const normalizedLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3;

  return dimensions
    .flatMap((dimension) => {
      const weakValue = weakCandidate[dimension];
      const candidateValue = upgradeCandidate[dimension];
      if (typeof weakValue !== "number" || !Number.isFinite(weakValue)) return [];
      if (typeof candidateValue !== "number" || !Number.isFinite(candidateValue)) return [];
      const improvement = candidateValue - weakValue;
      if (improvement <= 0) return [];
      const relevanceWeight = driverRelevance(dimension, risk, style, horizon);
      return [{ dimension, weakValue, candidateValue, improvement, relevanceWeight }];
    })
    .sort((a, b) => (b.improvement * b.relevanceWeight) - (a.improvement * a.relevanceWeight))
    .slice(0, normalizedLimit);
}

export function buildPortfolioActionPlan({
  portfolioScore,
  riskScore,
  diversificationScore,
  largestPosition,
  largestPositionWeight,
  requestedMaxPositionWeight,
  holdings,
  dataQuality,
  risk,
}: {
  portfolioScore: number | null;
  riskScore: number | null;
  diversificationScore: number | null;
  largestPosition: string | null;
  largestPositionWeight: number | null;
  requestedMaxPositionWeight: number;
  holdings: Array<{ ticker: string; weight: number | null; score: number | null; recommendation: string | null }>;
  dataQuality: PortfolioDataQuality;
  risk: RiskPreference;
}): PortfolioAction[] {
  const actions: Array<PortfolioAction & { rank: number }> = [];
  const negativeSignals = holdings.filter((holding) => ["Sell", "Strong Sell"].includes(holding.recommendation ?? ""));
  for (const holding of negativeSignals) {
    actions.push({
      priority: "high",
      code: "negative_signal",
      ticker: holding.ticker,
      recommendation: holding.recommendation,
      currentValue: holding.score,
      rank: holding.recommendation === "Strong Sell" ? 100 : 95,
    });
  }

  if (largestPositionWeight !== null && largestPositionWeight > requestedMaxPositionWeight) {
    actions.push({
      priority: "high",
      code: "concentration",
      ticker: largestPosition ?? undefined,
      currentValue: largestPositionWeight,
      targetValue: requestedMaxPositionWeight,
      rank: 90,
    });
  }

  if (risk === "defensive" && riskScore !== null && riskScore < 65) {
    actions.push({
      priority: "high",
      code: "risk_mismatch",
      currentValue: riskScore,
      targetValue: 65,
      rank: 85,
    });
  }

  const weakestHolding = holdings
    .filter((holding) => holding.score !== null && Number.isFinite(holding.score))
    .sort((a, b) => finite(a.score) - finite(b.score))[0];
  if (weakestHolding && finite(weakestHolding.score) < 55) {
    actions.push({
      priority: "medium",
      code: "weak_holding",
      ticker: weakestHolding.ticker,
      currentValue: weakestHolding.score,
      targetValue: 55,
      rank: 75,
    });
  }

  if (diversificationScore !== null && diversificationScore < 60) {
    actions.push({
      priority: "medium",
      code: "diversification",
      currentValue: diversificationScore,
      targetValue: 60,
      rank: 70,
    });
  }

  if (dataQuality.status !== "good") {
    actions.push({
      priority: "medium",
      code: "stale_data",
      count: dataQuality.recommendedAdditionalAnalyses,
      rank: dataQuality.status === "insufficient" ? 80 : 65,
    });
  }

  if (portfolioScore !== null && portfolioScore < 55) {
    actions.push({
      priority: "medium",
      code: "portfolio_score",
      currentValue: portfolioScore,
      targetValue: 55,
      rank: 60,
    });
  }

  if (!actions.length) {
    actions.push({ priority: "positive", code: "healthy", rank: 0 });
  }

  return actions
    .sort((a, b) => b.rank - a.rank)
    .map(({ rank: _rank, ...action }) => action);
}
