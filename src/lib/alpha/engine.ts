import type {
  AlphaDimensionScores,
  AlphaIntelligenceResult,
  AlphaProbabilityCurve,
  AlphaRisk,
  AlphaSignalInput,
  AlphaUpsideProbability,
} from "./types";

export const ALPHA_MODEL_VERSION = "alpha-1.0.0";

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const round1 = (value: number) => Math.round(value * 10) / 10;
const roundProbability = (value: number) => Math.round(clamp01(value) * 1000) / 1000;

function average(values: Array<number | null | undefined>, fallback = 50): number {
  const available = values.filter(finite);
  if (!available.length) return fallback;
  return available.reduce((sum, value) => sum + value, 0) / available.length;
}

function scoreAscending(value: number | null | undefined, bad: number, good: number): number | null {
  if (!finite(value)) return null;
  if (good === bad) return 50;
  return clamp(((value - bad) / (good - bad)) * 100);
}

function scoreDescending(value: number | null | undefined, good: number, bad: number): number | null {
  if (!finite(value)) return null;
  if (bad === good) return 50;
  return clamp(((bad - value) / (bad - good)) * 100);
}

function latestHistory(input: AlphaSignalInput) {
  return input.history.at(-1) ?? null;
}

function previousHistory(input: AlphaSignalInput) {
  return input.history.at(-2) ?? null;
}

function historyCoverage(input: AlphaSignalInput): number {
  if (!input.history.length) return 0;
  const fields = input.history.flatMap((row) => [
    row.revenueGrowth,
    row.operatingMargin,
    row.epsGrowth,
    row.fcfMargin,
    row.shareGrowth,
  ]);
  return fields.filter(finite).length / fields.length;
}

function computeUndervaluation(input: AlphaSignalInput): number {
  const { pe, evEbitda, fcfYield, earningsYield } = input.valuation;
  return round1(average([
    scoreDescending(pe, 8, 40),
    scoreDescending(evEbitda, 5, 24),
    scoreAscending(fcfYield, -0.02, 0.12),
    scoreAscending(earningsYield, -0.02, 0.10),
  ]));
}

function computeFinancialRisk(input: AlphaSignalInput): number {
  const { debtToEquity, netDebtToEbitda, interestCoverage, currentRatio } = input.balanceSheet;
  return round1(average([
    scoreAscending(debtToEquity, 0.1, 3.0),
    scoreAscending(netDebtToEbitda, 0.5, 6.0),
    scoreDescending(interestCoverage, 10, 0.5),
    scoreDescending(currentRatio, 2.0, 0.6),
  ], 45));
}

function computeQuality(input: AlphaSignalInput, financialRisk: number): number {
  const latest = latestHistory(input);
  const profitableYears = input.history.filter((row) => finite(row.operatingMargin) && row.operatingMargin > 0).length;
  const observedMarginYears = input.history.filter((row) => finite(row.operatingMargin)).length;
  const consistency = observedMarginYears ? (profitableYears / observedMarginYears) * 100 : null;

  return round1(average([
    scoreAscending(latest?.operatingMargin, -0.10, 0.25),
    scoreAscending(latest?.fcfMargin, -0.10, 0.20),
    consistency,
    100 - financialRisk,
  ]));
}

function computeGrowthAcceleration(input: AlphaSignalInput): number {
  const latest = latestHistory(input);
  const previous = previousHistory(input);
  const oldest = input.history.at(-3) ?? null;

  const deltas = [
    finite(latest?.revenueGrowth) && finite(previous?.revenueGrowth) ? latest.revenueGrowth - previous.revenueGrowth : null,
    finite(previous?.revenueGrowth) && finite(oldest?.revenueGrowth) ? previous.revenueGrowth - oldest.revenueGrowth : null,
    finite(latest?.epsGrowth) && finite(previous?.epsGrowth) ? (latest.epsGrowth - previous.epsGrowth) * 0.65 : null,
    finite(latest?.operatingMargin) && finite(previous?.operatingMargin) ? (latest.operatingMargin - previous.operatingMargin) * 1.5 : null,
    finite(latest?.fcfMargin) && finite(previous?.fcfMargin) ? (latest.fcfMargin - previous.fcfMargin) * 1.25 : null,
    finite(input.forward.revenueGrowth) && finite(latest?.revenueGrowth) ? (input.forward.revenueGrowth - latest.revenueGrowth) * 0.55 : null,
  ].filter(finite);

  if (!deltas.length) return 50;
  const rawAcceleration = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  return round1(scoreAscending(rawAcceleration, -0.10, 0.10) ?? 50);
}

function computeEarningsInflection(input: AlphaSignalInput): number {
  const latest = latestHistory(input);
  const previous = previousHistory(input);
  const marginChange = finite(latest?.operatingMargin) && finite(previous?.operatingMargin)
    ? latest.operatingMargin - previous.operatingMargin
    : null;
  const fcfMarginChange = finite(latest?.fcfMargin) && finite(previous?.fcfMargin)
    ? latest.fcfMargin - previous.fcfMargin
    : null;
  const crossedToPositive = finite(latest?.epsGrowth) && finite(previous?.epsGrowth) && previous.epsGrowth <= 0 && latest.epsGrowth > 0;

  let score = average([
    scoreAscending(latest?.epsGrowth, -0.30, 0.40),
    scoreAscending(input.forward.epsGrowth, -0.20, 0.35),
    scoreAscending(marginChange, -0.05, 0.06),
    scoreAscending(fcfMarginChange, -0.06, 0.08),
    scoreAscending(input.forward.fcfGrowth, -0.20, 0.35),
  ]);
  if (crossedToPositive) score += 8;
  return round1(clamp(score));
}

function computeCatalyst(input: AlphaSignalInput): number {
  if (!input.catalyst) return 50;
  const sourceConfidence = clamp01(input.catalyst.confidence);
  const sourceBreadth = clamp01(input.catalyst.sourceCount / 3);
  return round1(clamp(100 * clamp01(input.catalyst.strength) * (0.7 + 0.2 * sourceConfidence + 0.1 * sourceBreadth)));
}

function computeMomentum(input: AlphaSignalInput): number {
  return round1(average([
    scoreAscending(input.market.performance1m, -0.15, 0.25),
    scoreAscending(input.market.performance3m, -0.25, 0.45),
    scoreAscending(input.market.performance6m, -0.35, 0.70),
    scoreAscending(input.market.performance1y, -0.45, 1.0),
  ]));
}

function computeEstimateRevisions(input: AlphaSignalInput): number {
  if (!input.estimateRevision) return 50;
  const direction = clamp(input.estimateRevision.direction, -1, 1);
  const magnitude = clamp01(Math.abs(input.estimateRevision.magnitude));
  const confidence = clamp01(input.estimateRevision.confidence);
  return round1(clamp(50 + direction * (25 + 25 * magnitude) * (0.55 + 0.45 * confidence)));
}

function computeSentimentShift(input: AlphaSignalInput): number {
  if (!input.sentimentShift) return 50;
  return round1(clamp(50 + clamp(input.sentimentShift.direction, -1, 1) * 50 * (0.5 + 0.5 * clamp01(input.sentimentShift.confidence))));
}

function computeDilutionRisk(input: AlphaSignalInput): number {
  const latest = latestHistory(input);
  if (!finite(latest?.shareGrowth)) return 35;
  return round1(scoreAscending(latest.shareGrowth, 0, 0.30) ?? 35);
}

function computeLiquidityRisk(input: AlphaSignalInput): number {
  const capRisk = !finite(input.market.marketCap)
    ? 45
    : input.market.marketCap <= 100_000_000 ? 85
    : input.market.marketCap <= 300_000_000 ? 65
    : input.market.marketCap <= 1_000_000_000 ? 40
    : input.market.marketCap <= 5_000_000_000 ? 20
    : 8;
  const volumeRisk = !finite(input.market.volume)
    ? 45
    : input.market.volume < 20_000 ? 90
    : input.market.volume < 75_000 ? 65
    : input.market.volume < 250_000 ? 38
    : input.market.volume < 1_000_000 ? 18
    : 8;
  return round1(0.55 * capRisk + 0.45 * volumeRisk);
}

function computeHypeRisk(momentum: number, growth: number, quality: number, undervaluation: number): number {
  const excessiveMomentum = clamp((momentum - 65) * 2.5);
  const weakFundamentals = clamp(100 - average([growth, quality, undervaluation]));
  return round1(clamp(0.62 * excessiveMomentum + 0.38 * weakFundamentals));
}

function computeSmallCapAsymmetry(input: AlphaSignalInput, coreOpportunity: number, liquidityRisk: number): number {
  const cap = input.market.marketCap;
  const sizePotential = !finite(cap) ? 20
    : cap <= 300_000_000 ? 100
    : cap <= 1_000_000_000 ? 82
    : cap <= 3_000_000_000 ? 62
    : cap <= 10_000_000_000 ? 35
    : 10;
  const qualityGate = clamp((coreOpportunity - 40) / 60, 0, 1);
  const sizeBonus = sizePotential * qualityGate;
  return round1(clamp(0.78 * coreOpportunity + 0.22 * sizeBonus - 0.14 * liquidityRisk));
}

function weightedSignal(scores: Omit<AlphaDimensionScores, "smallCapAsymmetry" | "breakoutProbability">, smallCapAsymmetry: number): number {
  return (
    scores.growthAcceleration * 0.17 +
    scores.earningsInflection * 0.16 +
    scores.undervaluation * 0.16 +
    scores.quality * 0.14 +
    scores.catalyst * 0.11 +
    scores.momentum * 0.10 +
    scores.estimateRevisions * 0.07 +
    scores.sentimentShift * 0.03 +
    smallCapAsymmetry * 0.06
  );
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function upsideCurve(score: number, confidence: number, horizonShift: number): AlphaUpsideProbability {
  const calibration = 0.62 + 0.38 * clamp01(confidence);
  const base = (score - 50) / 15 + horizonShift;
  const up10 = clamp01(sigmoid(base) * calibration);
  const up25 = clamp01(sigmoid(base - 0.85) * calibration);
  const up50 = clamp01(sigmoid(base - 1.65) * calibration);
  return {
    up10: roundProbability(up10),
    up25: roundProbability(Math.min(up10, up25)),
    up50: roundProbability(Math.min(up25, up50)),
  };
}

function probabilityCurve(score: number, confidence: number): AlphaProbabilityCurve {
  return {
    oneMonth: upsideCurve(score, confidence, -0.85),
    threeMonths: upsideCurve(score, confidence, -0.35),
    sixMonths: upsideCurve(score, confidence, 0.05),
    twelveMonths: upsideCurve(score, confidence, 0.35),
  };
}

function classification(alphaScore: number, confidence: number, risk: AlphaRisk) {
  if (alphaScore >= 82 && confidence >= 0.68 && risk.overall <= 48) return "exceptional" as const;
  if (alphaScore >= 70 && confidence >= 0.55 && risk.overall <= 62) return "high_potential" as const;
  if (alphaScore >= 54) return "watchlist" as const;
  return "low_conviction" as const;
}

function strongestSignals(scores: AlphaDimensionScores): string[] {
  const labels: Array<[keyof AlphaDimensionScores, string]> = [
    ["undervaluation", "Valuation asymmetry"],
    ["quality", "Business quality"],
    ["growthAcceleration", "Growth acceleration"],
    ["earningsInflection", "Earnings inflection"],
    ["catalyst", "Catalyst strength"],
    ["momentum", "Momentum confirmation"],
    ["estimateRevisions", "Estimate revisions"],
    ["sentimentShift", "Sentiment shift"],
    ["smallCapAsymmetry", "Small-cap asymmetry"],
  ];
  return labels
    .map(([key, label]) => ({ label, value: scores[key] }))
    .filter((item) => item.value >= 62)
    .sort((left, right) => right.value - left.value)
    .slice(0, 4)
    .map((item) => item.label);
}

function riskSignals(risk: AlphaRisk): string[] {
  const candidates = [
    [risk.financialRisk, "Elevated financial risk"],
    [risk.dilutionRisk, "Elevated dilution risk"],
    [risk.liquidityRisk, "Elevated liquidity risk"],
    [risk.hypeRisk, "Momentum may be running ahead of fundamentals"],
  ] as const;
  return candidates
    .filter(([value]) => value >= 58)
    .sort((left, right) => right[0] - left[0])
    .map(([, label]) => label);
}

export function computeAlphaIntelligence(input: AlphaSignalInput): AlphaIntelligenceResult {
  const dataQuality = clamp01(input.dataQuality);
  const fundamentalCoverage = historyCoverage(input);
  const forwardAvailable = [input.forward.revenueGrowth, input.forward.epsGrowth, input.forward.fcfGrowth].filter(finite).length / 3;
  const catalystCoverage = input.catalyst ? clamp01((input.catalyst.sourceCount / 2) * input.catalyst.confidence) : 0;
  const revisionCoverage = input.estimateRevision ? clamp01(input.estimateRevision.confidence) : 0;
  const sentimentCoverage = input.sentimentShift ? clamp01(input.sentimentShift.confidence) : 0;

  const financialRisk = computeFinancialRisk(input);
  const undervaluation = computeUndervaluation(input);
  const quality = computeQuality(input, financialRisk);
  const growthAcceleration = computeGrowthAcceleration(input);
  const earningsInflection = computeEarningsInflection(input);
  const catalyst = computeCatalyst(input);
  const momentum = computeMomentum(input);
  const estimateRevisions = computeEstimateRevisions(input);
  const sentimentShift = computeSentimentShift(input);
  const dilutionRisk = computeDilutionRisk(input);
  const liquidityRisk = computeLiquidityRisk(input);
  const hypeRisk = computeHypeRisk(momentum, growthAcceleration, quality, undervaluation);

  const coreOpportunity = (
    growthAcceleration * 0.25 +
    earningsInflection * 0.22 +
    undervaluation * 0.20 +
    quality * 0.18 +
    catalyst * 0.15
  );
  const smallCapAsymmetry = computeSmallCapAsymmetry(input, coreOpportunity, liquidityRisk);

  const baseScores = {
    undervaluation,
    quality,
    growthAcceleration,
    earningsInflection,
    catalyst,
    momentum,
    estimateRevisions,
    sentimentShift,
  };
  const signal = weightedSignal(baseScores, smallCapAsymmetry);
  const overallRisk = round1(0.38 * financialRisk + 0.24 * dilutionRisk + 0.20 * liquidityRisk + 0.18 * hypeRisk);
  const risk: AlphaRisk = { financialRisk, dilutionRisk, liquidityRisk, hypeRisk, overall: overallRisk };

  const coverage = {
    fundamentalHistory: roundProbability(fundamentalCoverage),
    forwardEstimates: roundProbability(forwardAvailable),
    catalyst: roundProbability(catalystCoverage),
    estimateRevisions: roundProbability(revisionCoverage),
    sentiment: roundProbability(sentimentCoverage),
  };
  const essentialCoverage = 0.58 * fundamentalCoverage + 0.22 * forwardAvailable + 0.20 * dataQuality;
  const confidence = roundProbability(clamp01(0.55 * dataQuality + 0.45 * essentialCoverage));

  const riskPenalty = 0.20 * overallRisk + 0.07 * hypeRisk;
  const lowCoveragePenalty = Math.max(0, 0.55 - essentialCoverage) * 22;
  const alphaScore = round1(clamp(signal - riskPenalty - lowCoveragePenalty + 12));
  const breakoutProbability = round1(clamp(0.72 * alphaScore + 0.18 * momentum + 0.10 * catalyst - 0.08 * hypeRisk));

  const scores: AlphaDimensionScores = {
    ...baseScores,
    smallCapAsymmetry,
    breakoutProbability,
  };

  return {
    ticker: input.ticker,
    companyName: input.companyName,
    modelVersion: ALPHA_MODEL_VERSION,
    generatedAt: input.analysisDate,
    alphaScore,
    classification: classification(alphaScore, confidence, risk),
    confidence,
    scores,
    risk,
    probabilities: probabilityCurve(breakoutProbability, confidence),
    strongestSignals: strongestSignals(scores),
    riskSignals: riskSignals(risk),
    coverage,
    methodology: {
      purpose: "ranking",
      independentFromFundamentalScore: true,
      probabilitiesAreModelImplied: true,
    },
  };
}
