import { aggregateIntelligenceEvidence, intelligenceConfidence, type IntelligenceEvidence } from "./intelligence-common";

export type MispricingLabel = "deep_discount" | "discounted" | "roughly_fair" | "premium" | "uncertain";
export type ValueTrapRisk = "low" | "medium" | "high";

export type MispricingInput = {
  currentPrice: number | null;
  dcf?: {
    suitable: boolean;
    bear: number | null;
    base: number | null;
    bull: number | null;
    confidence: number;
  } | null;
  historicalPe?: {
    current: number | null;
    median: number | null;
    sufficientHistory: boolean;
    observationCount: number;
  } | null;
  peerValuationScore?: number | null;
  valuationDimensionScore?: number | null;
  trends?: {
    revenueGrowthCurrent?: number | null;
    revenueGrowthPrior?: number | null;
    epsGrowthCurrent?: number | null;
    epsGrowthPrior?: number | null;
    fcfMarginCurrent?: number | null;
    fcfMarginPrior?: number | null;
    operatingMarginCurrent?: number | null;
    operatingMarginPrior?: number | null;
    cashConversion?: number | null;
    debtToEquity?: number | null;
    interestCoverage?: number | null;
    shareGrowth?: number | null;
  };
  revisionNetLastMonth?: number | null;
  redFlags?: Array<{ severity: "low" | "medium" | "high" | "critical"; title: string }>;
  sourceConflictSeverity?: "none" | "medium" | "high";
  dataStatus?: "current" | "stale" | "unavailable";
  dataAsOf?: string | null;
};

export type MispricingPillar = {
  id: "intrinsic_value" | "historical_self_valuation" | "peer_relative_valuation" | "earnings_cashflow_power";
  label: string;
  score: number | null;
  weight: number;
  detail: string;
};

export type MispricingAssessment = {
  score: number | null;
  confidence: number;
  coverage: number;
  label: MispricingLabel;
  pillars: MispricingPillar[];
  valueTrapRisk: ValueTrapRisk;
  positiveEvidence: string[];
  counterEvidence: string[];
  dataAsOf: string | null;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function priceVsFairValueScore(input: MispricingInput): { score: number | null; detail: string } {
  const dcf = input.dcf;
  if (!dcf?.suitable || !finite(input.currentPrice) || input.currentPrice <= 0 || !finite(dcf.base) || dcf.base <= 0) {
    return { score: null, detail: "Intrinsic-value evidence is unavailable or unsuitable for this company." };
  }
  const upside = dcf.base / input.currentPrice - 1;
  const directional = clamp(50 + upside * 100, 0, 100);
  const confidence = clamp(dcf.confidence, 0, 100) / 100;
  const score = 50 + (directional - 50) * confidence;
  return {
    score,
    detail: `DCF base value implies ${(upside * 100).toFixed(1)}% upside/downside versus the current price; DCF confidence ${Math.round(dcf.confidence)}%.`,
  };
}

function historicalSelfValuationScore(input: MispricingInput): { score: number | null; detail: string } {
  const history = input.historicalPe;
  if (!history?.sufficientHistory || history.observationCount < 12 || !finite(history.current) || !finite(history.median) || history.current <= 0 || history.median <= 0) {
    return { score: null, detail: "Historical self-valuation does not have enough comparable positive P/E observations." };
  }
  const relativeDiscount = history.median / history.current - 1;
  return {
    score: clamp(50 + relativeDiscount * 85, 0, 100),
    detail: `Current P/E ${history.current.toFixed(1)}x versus historical median ${history.median.toFixed(1)}x across ${history.observationCount} observations.`,
  };
}

function labelFor(score: number | null): MispricingLabel {
  if (score === null) return "uncertain";
  if (score >= 82) return "deep_discount";
  if (score >= 65) return "discounted";
  if (score >= 42) return "roughly_fair";
  return "premium";
}

function deteriorationEvidence(input: MispricingInput): { points: number; reasons: string[] } {
  const trends = input.trends ?? {};
  let points = 0;
  const reasons: string[] = [];
  const worseningGrowth = (current: number | null | undefined, prior: number | null | undefined, name: string) => {
    if (!finite(current) || !finite(prior)) return;
    if (current < 0 && prior >= 0) {
      points += 8;
      reasons.push(`${name} has moved from positive to negative growth.`);
    } else if (current - prior <= -0.12) {
      points += 6;
      reasons.push(`${name} growth has decelerated materially.`);
    }
  };
  worseningGrowth(trends.revenueGrowthCurrent, trends.revenueGrowthPrior, "Revenue");
  worseningGrowth(trends.epsGrowthCurrent, trends.epsGrowthPrior, "EPS");

  const marginDeterioration = (current: number | null | undefined, prior: number | null | undefined, name: string) => {
    if (finite(current) && finite(prior) && prior - current >= 0.05) {
      points += 7;
      reasons.push(`${name} has contracted by at least five percentage points.`);
    }
  };
  marginDeterioration(trends.fcfMarginCurrent, trends.fcfMarginPrior, "FCF margin");
  marginDeterioration(trends.operatingMarginCurrent, trends.operatingMarginPrior, "Operating margin");

  if (finite(trends.cashConversion) && trends.cashConversion < 0.5) {
    points += 6;
    reasons.push("Cash conversion is weak relative to reported earnings.");
  }
  if (finite(trends.debtToEquity) && trends.debtToEquity > 2) {
    points += 7;
    reasons.push("Leverage is high relative to equity.");
  }
  if (finite(trends.interestCoverage) && trends.interestCoverage > 0 && trends.interestCoverage < 2) {
    points += 7;
    reasons.push("Interest coverage is weak.");
  }
  if (finite(trends.shareGrowth) && trends.shareGrowth > 0.08) {
    points += 8;
    reasons.push("Material share-count growth indicates dilution risk.");
  }
  if (finite(input.revisionNetLastMonth) && input.revisionNetLastMonth < 0) {
    points += 6;
    reasons.push("Analyst estimate revisions are net negative over the last month.");
  }

  for (const flag of input.redFlags ?? []) {
    if (flag.severity === "critical") {
      points += 15;
      reasons.push(`Critical risk flag: ${flag.title}.`);
    } else if (flag.severity === "high") {
      points += 6;
      reasons.push(`High-severity risk flag: ${flag.title}.`);
    }
  }

  return { points: Math.min(45, points), reasons };
}

function valueTrapRiskFor(points: number): ValueTrapRisk {
  if (points >= 20) return "high";
  if (points >= 8) return "medium";
  return "low";
}

export function computeMispricingAssessment(input: MispricingInput): MispricingAssessment {
  const intrinsic = priceVsFairValueScore(input);
  const historical = historicalSelfValuationScore(input);
  const pillars: MispricingPillar[] = [
    { id: "intrinsic_value", label: "Intrinsic value", score: intrinsic.score, weight: 0.3, detail: intrinsic.detail },
    { id: "historical_self_valuation", label: "Historical self-valuation", score: historical.score, weight: 0.25, detail: historical.detail },
    {
      id: "peer_relative_valuation",
      label: "Peer-relative valuation",
      score: finite(input.peerValuationScore) ? clamp(input.peerValuationScore, 0, 100) : null,
      weight: 0.2,
      detail: finite(input.peerValuationScore) ? "Uses StockBox peer-relative valuation evidence." : "Comparable peer valuation evidence is unavailable.",
    },
    {
      id: "earnings_cashflow_power",
      label: "Earnings & cash-flow power",
      score: finite(input.valuationDimensionScore) ? clamp(input.valuationDimensionScore, 0, 100) : null,
      weight: 0.25,
      detail: finite(input.valuationDimensionScore) ? "Uses the archetype-aware StockBox valuation dimension." : "Archetype-aware valuation evidence is unavailable.",
    },
  ];

  const evidence: IntelligenceEvidence[] = pillars.map((pillar) => ({
    id: pillar.id,
    label: pillar.label,
    score: pillar.score,
    weight: pillar.weight,
    family: "valuation",
    detail: pillar.detail,
    dataAsOf: input.dataAsOf,
  }));
  const aggregate = aggregateIntelligenceEvidence(evidence, { minimumCoverage: 0.5 });
  const trap = deteriorationEvidence(input);
  const score = aggregate.score === null ? null : clamp(aggregate.score - trap.points, 0, 100);

  const uncertaintyPenalty =
    (input.sourceConflictSeverity === "high" ? 20 : input.sourceConflictSeverity === "medium" ? 8 : 0)
    + (input.dataStatus === "stale" ? 15 : input.dataStatus === "unavailable" ? 35 : 0);
  const confidence = intelligenceConfidence(95, aggregate.coverage, uncertaintyPenalty);

  const positiveEvidence = pillars
    .filter((pillar) => finite(pillar.score) && pillar.score >= 65)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .map((pillar) => `${pillar.label}: ${pillar.detail}`);
  const counterEvidence = [
    ...trap.reasons,
    ...pillars
      .filter((pillar) => finite(pillar.score) && pillar.score <= 35)
      .map((pillar) => `${pillar.label}: ${pillar.detail}`),
  ];
  if (input.sourceConflictSeverity === "high") counterEvidence.push("High-severity provider/source conflict lowers confidence in the valuation snapshot.");
  else if (input.sourceConflictSeverity === "medium") counterEvidence.push("Provider/source conflict lowers confidence in the valuation snapshot.");
  if (input.dataStatus === "stale") counterEvidence.push("Stale source data lowers confidence; it is not treated as negative valuation evidence.");
  if (input.dataStatus === "unavailable") counterEvidence.push("Critical source data is unavailable, so confidence is heavily reduced.");

  return {
    score,
    confidence,
    coverage: aggregate.coverage,
    label: labelFor(score),
    pillars,
    valueTrapRisk: valueTrapRiskFor(trap.points),
    positiveEvidence,
    counterEvidence,
    dataAsOf: input.dataAsOf ?? null,
  };
}
