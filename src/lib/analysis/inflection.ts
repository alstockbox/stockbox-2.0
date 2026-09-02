import { aggregateIntelligenceEvidence, intelligenceConfidence, type IntelligenceEvidence } from "./intelligence-common";

export type InflectionStage = "dormant" | "building" | "confirming" | "extended" | "fragile" | "uncertain";
export type OverextensionRisk = "low" | "medium" | "high";

export type InflectionInput = {
  fundamentals?: {
    revenueGrowthCurrent?: number | null; revenueGrowthPrior?: number | null;
    epsGrowthCurrent?: number | null; epsGrowthPrior?: number | null;
    fcfMarginCurrent?: number | null; fcfMarginPrior?: number | null;
    operatingMarginCurrent?: number | null; operatingMarginPrior?: number | null;
    roicCurrent?: number | null; roicPrior?: number | null;
  } | null;
  expectations?: { revisionNetLastWeek?: number | null; revisionNetLastMonth?: number | null; nextYearRevenueGrowth?: number | null; nextYearEpsGrowth?: number | null } | null;
  market?: { oneMonth?: number | null; threeMonth?: number | null; sixMonth?: number | null; oneYear?: number | null; price?: number | null; yearHigh?: number | null; yearLow?: number | null } | null;
  funding?: { financialHealthScore?: number | null; shareGrowth?: number | null; interestCoverage?: number | null; criticalRisk?: boolean } | null;
  research?: { positiveCatalysts?: number; negativeCatalysts?: number } | null;
  dataAsOf?: string | null;
};

export type InflectionSignal = {
  id: "fundamental_acceleration" | "expectations" | "market_confirmation" | "funding_quality" | "research_catalysts";
  label: string; score: number | null; weight: number; family: "fundamental" | "expectations" | "market" | "funding" | "research"; detail: string;
};

export type InflectionAssessment = {
  score: number | null; confidence: number; coverage: number; stage: InflectionStage; signals: InflectionSignal[];
  accelerators: string[]; brakes: string[]; overextensionRisk: OverextensionRisk; availableFamilies: string[]; dataAsOf: string | null;
};

function finite(value: number | null | undefined): value is number { return typeof value === "number" && Number.isFinite(value); }
function clamp(value: number, min = 0, max = 100): number { return Math.max(min, Math.min(max, value)); }
function average(values: Array<number | null>): number | null { const available = values.filter((value): value is number => finite(value)); return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null; }
function growthAccelerationScore(current: number | null | undefined, prior: number | null | undefined): number | null {
  if (!finite(current) || !finite(prior)) return null;
  return clamp(50 + current * 130) * 0.5 + clamp(50 + (current - prior) * 220) * 0.5;
}
function improvementScore(current: number | null | undefined, prior: number | null | undefined, scale: number): number | null {
  if (!finite(current) || !finite(prior)) return null;
  return clamp(50 + (current - prior) * scale);
}

function fundamentalSignal(input: InflectionInput): InflectionSignal {
  const data = input.fundamentals;
  const score = data ? average([
    growthAccelerationScore(data.revenueGrowthCurrent, data.revenueGrowthPrior), growthAccelerationScore(data.epsGrowthCurrent, data.epsGrowthPrior),
    improvementScore(data.fcfMarginCurrent, data.fcfMarginPrior, 500), improvementScore(data.operatingMarginCurrent, data.operatingMarginPrior, 500), improvementScore(data.roicCurrent, data.roicPrior, 500),
  ]) : null;
  return { id: "fundamental_acceleration", label: "Fundamental acceleration", score, weight: 0.32, family: "fundamental", detail: score === null ? "Comparable growth, margin or return history is insufficient." : "Measures whether growth, cash-flow margins, operating margins and returns are improving rather than merely high in absolute terms." };
}

function expectationsSignal(input: InflectionInput): InflectionSignal {
  const data = input.expectations;
  const score = data ? average([
    finite(data.revisionNetLastWeek) ? clamp(50 + data.revisionNetLastWeek * 10) : null,
    finite(data.revisionNetLastMonth) ? clamp(50 + data.revisionNetLastMonth * 5) : null,
    finite(data.nextYearRevenueGrowth) ? clamp(50 + data.nextYearRevenueGrowth * 160) : null,
    finite(data.nextYearEpsGrowth) ? clamp(50 + data.nextYearEpsGrowth * 160) : null,
  ]) : null;
  return { id: "expectations", label: "Expectations & revisions", score, weight: 0.2, family: "expectations", detail: score === null ? "Licensed analyst estimates/revisions are unavailable; missing expectations reduce coverage but are not scored negatively." : "Combines revision breadth with forward revenue and EPS growth expectations." };
}

function rangePosition(price: number | null | undefined, low: number | null | undefined, high: number | null | undefined): number | null {
  if (!finite(price) || !finite(low) || !finite(high) || high <= low) return null;
  return clamp((price - low) / (high - low), 0, 1);
}

function overextensionRisk(input: InflectionInput): OverextensionRisk {
  const market = input.market;
  if (!market) return "low";
  const position = rangePosition(market.price, market.yearLow, market.yearHigh);
  if ((finite(market.oneMonth) && market.oneMonth > 0.3) || (finite(market.threeMonth) && market.threeMonth > 0.65) || (finite(position) && position > 0.98 && finite(market.threeMonth) && market.threeMonth > 0.4)) return "high";
  if ((finite(market.oneMonth) && market.oneMonth > 0.2) || (finite(market.threeMonth) && market.threeMonth > 0.45)) return "medium";
  return "low";
}

function marketSignal(input: InflectionInput, extension: OverextensionRisk): InflectionSignal {
  const data = input.market;
  const position = data ? rangePosition(data.price, data.yearLow, data.yearHigh) : null;
  let score = data ? average([
    finite(data.oneMonth) ? clamp(50 + data.oneMonth * 300) : null,
    finite(data.threeMonth) ? clamp(50 + data.threeMonth * 200) : null,
    finite(data.sixMonth) ? clamp(50 + data.sixMonth * 150) : null,
    finite(data.oneYear) ? clamp(50 + data.oneYear * 100) : null,
    finite(position) ? clamp(42 + position * 50) : null,
  ]) : null;
  if (score !== null && extension === "high") score = clamp(score - 25);
  else if (score !== null && extension === "medium") score = clamp(score - 10);
  return { id: "market_confirmation", label: "Market confirmation", score, weight: 0.25, family: "market", detail: score === null ? "Price-trend history is insufficient." : extension === "high" ? "Trend is strong but parabolic/near-extreme price action is penalized as overextension rather than rewarded blindly." : "Uses multiple momentum horizons and 52-week range position for early market confirmation." };
}

function fundingSignal(input: InflectionInput): { signal: InflectionSignal; penalty: number; brakes: string[]; critical: boolean } {
  const data = input.funding;
  if (!data) return { signal: { id: "funding_quality", label: "Funding & survival quality", score: null, weight: 0.15, family: "funding", detail: "Financial-health evidence is unavailable." }, penalty: 0, brakes: [], critical: false };
  let score = finite(data.financialHealthScore) ? clamp(data.financialHealthScore) : null;
  let penalty = 0;
  const brakes: string[] = [];
  if (finite(data.shareGrowth) && data.shareGrowth > 0.08) {
    const dilutionPenalty = clamp(10 + (data.shareGrowth - 0.08) * 150, 10, 30);
    penalty += dilutionPenalty * 0.5;
    if (score !== null) score = clamp(score - dilutionPenalty);
    brakes.push("Material dilution reduces the quality of the setup.");
  }
  if (finite(data.interestCoverage) && data.interestCoverage > 0 && data.interestCoverage < 2) { penalty += 8; if (score !== null) score = clamp(score - 25); brakes.push("Weak interest coverage increases funding risk."); }
  else if (finite(data.interestCoverage) && data.interestCoverage >= 2 && data.interestCoverage < 4) { penalty += 3; if (score !== null) score = clamp(score - 10); brakes.push("Interest coverage is only moderate."); }
  if (data.criticalRisk) { penalty += 20; score = score === null ? 10 : Math.min(score, 10); brakes.push("Critical financial-risk gate is active; strong growth or momentum cannot override survival risk."); }
  return { signal: { id: "funding_quality", label: "Funding & survival quality", score, weight: 0.15, family: "funding", detail: "Uses StockBox financial-health evidence with explicit dilution and debt-service penalties." }, penalty, brakes, critical: Boolean(data.criticalRisk) };
}

function researchSignal(input: InflectionInput): InflectionSignal {
  const data = input.research;
  const positive = data?.positiveCatalysts ?? 0;
  const negative = data?.negativeCatalysts ?? 0;
  const available = Boolean(data) && positive + negative > 0;
  const score = available ? clamp(50 + positive * 15 - negative * 20) : null;
  return { id: "research_catalysts", label: "Research & catalysts", score, weight: 0.08, family: "research", detail: score === null ? "No verified catalyst evidence is available; StockBox does not invent catalysts." : "Uses verified positive and negative catalyst evidence from the research layer." };
}

export function computeInflectionAssessment(input: InflectionInput): InflectionAssessment {
  const extension = overextensionRisk(input);
  const funding = fundingSignal(input);
  const signals: InflectionSignal[] = [fundamentalSignal(input), expectationsSignal(input), marketSignal(input, extension), funding.signal, researchSignal(input)];
  const aggregate = aggregateIntelligenceEvidence(signals.map((signal): IntelligenceEvidence => ({ id: signal.id, label: signal.label, score: signal.score, weight: signal.weight, family: signal.family, detail: signal.detail, dataAsOf: input.dataAsOf })), { minimumCoverage: 0.5 });
  let score = aggregate.score;
  if (score !== null) score = clamp(score - funding.penalty);
  if (score !== null && score > 80 && aggregate.availableFamilies.length < 3) score = 80;
  if (funding.critical && score !== null) score = Math.min(score, 35);
  const fundamental = signals.find((signal) => signal.id === "fundamental_acceleration")?.score ?? null;
  const market = signals.find((signal) => signal.id === "market_confirmation")?.score ?? null;
  let stage: InflectionStage;
  if (funding.critical) stage = "fragile";
  else if (extension === "high") stage = "extended";
  else if (score === null) stage = "uncertain";
  else if (finite(fundamental) && fundamental >= 65 && finite(market) && market >= 60 && score >= 70) stage = "confirming";
  else if (finite(fundamental) && fundamental >= 60) stage = "building";
  else if (score < 45) stage = "dormant";
  else stage = "building";
  const accelerators = signals.filter((signal) => finite(signal.score) && signal.score >= 65).sort((a, b) => (b.score as number) - (a.score as number)).map((signal) => `${signal.label}: ${signal.detail}`);
  const brakes = [...funding.brakes];
  if (extension === "high") brakes.push("Price action appears overextended; StockBox reduces conviction rather than rewarding parabolic momentum.");
  else if (extension === "medium") brakes.push("Price action is becoming extended and deserves tighter risk control.");
  if (finite(market) && market < 50) brakes.push("Market confirmation is weak or negative despite other improving signals.");
  const expectations = signals.find((signal) => signal.id === "expectations");
  if (finite(expectations?.score) && (expectations?.score as number) < 45) brakes.push("Expectations/revisions are negative and work against the inflection thesis.");
  const confidencePenalty = extension === "high" ? 10 : extension === "medium" ? 4 : 0;
  const confidence = intelligenceConfidence(95, aggregate.coverage, confidencePenalty + (funding.critical ? 20 : 0));
  return { score, confidence, coverage: aggregate.coverage, stage, signals, accelerators, brakes, overextensionRisk: extension, availableFamilies: aggregate.availableFamilies, dataAsOf: input.dataAsOf ?? null };
}
