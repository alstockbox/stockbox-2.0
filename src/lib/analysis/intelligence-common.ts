export type IntelligenceEvidenceFamily =
  | "fundamental"
  | "valuation"
  | "expectations"
  | "market"
  | "funding"
  | "research"
  | "quality"
  | "risk";

export type IntelligenceEvidence = {
  id: string;
  label: string;
  score: number | null;
  weight: number;
  family: IntelligenceEvidenceFamily;
  detail?: string;
  dataAsOf?: string | null;
};

export type IntelligenceAggregate = {
  score: number | null;
  coverage: number;
  plannedWeight: number;
  availableWeight: number;
  availableCount: number;
  availableFamilies: IntelligenceEvidenceFamily[];
};

export type IntelligenceSignal = {
  id: string;
  label: string;
  score: number | null;
  weight: number;
  confidence: number;
  source?: string;
  detail?: string;
  dataAsOf?: string | null;
  family?: IntelligenceEvidenceFamily;
};

export type IntelligenceSignalAggregate = IntelligenceAggregate & {
  confidence: number;
  signals: IntelligenceSignal[];
  missingEvidence: string[];
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function aggregateIntelligenceEvidence(
  evidence: IntelligenceEvidence[],
  options: { minimumCoverage?: number } = {},
): IntelligenceAggregate {
  const weighted = evidence.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
  const plannedWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const available = weighted.filter((item) => typeof item.score === "number" && Number.isFinite(item.score));
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const coverage = plannedWeight > 0 ? availableWeight / plannedWeight : 0;
  const minimumCoverage = Math.max(0, Math.min(1, options.minimumCoverage ?? 0));
  const rawScore = availableWeight > 0
    ? available.reduce((sum, item) => sum + clampScore(item.score as number) * item.weight, 0) / availableWeight
    : null;
  const score = rawScore === null || coverage < minimumCoverage ? null : clampScore(rawScore);
  const availableFamilies = [...new Set(available.map((item) => item.family))];

  return {
    score,
    coverage,
    plannedWeight,
    availableWeight,
    availableCount: available.length,
    availableFamilies,
  };
}

export function aggregateIntelligenceSignals(
  signals: IntelligenceSignal[],
  options: { minimumCoverage?: number; confidencePenalty?: number } = {},
): IntelligenceSignalAggregate {
  const evidence = signals.map<IntelligenceEvidence>((signal) => ({
    id: signal.id,
    label: signal.label,
    score: signal.score,
    weight: signal.weight,
    family: signal.family ?? "research",
    detail: signal.detail,
    dataAsOf: signal.dataAsOf,
  }));
  const aggregate = aggregateIntelligenceEvidence(evidence, { minimumCoverage: options.minimumCoverage });
  const weightedSignals = signals.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
  const available = weightedSignals.filter((item) => typeof item.score === "number" && Number.isFinite(item.score));
  const weightedConfidence = aggregate.availableWeight > 0
    ? available.reduce((sum, item) => sum + clampUnit(item.confidence) * item.weight, 0) / aggregate.availableWeight
    : 0;
  const confidencePenalty = clampUnit(options.confidencePenalty ?? 1);
  const confidence = aggregate.score === null
    ? 0
    : clampUnit(weightedConfidence * aggregate.coverage * confidencePenalty);

  return {
    ...aggregate,
    confidence,
    signals,
    missingEvidence: weightedSignals
      .filter((item) => typeof item.score !== "number" || !Number.isFinite(item.score))
      .map((item) => item.id),
  };
}

export function intelligenceConfidence(
  baseConfidence: number,
  coverage: number,
  penaltyPoints = 0,
): number {
  const normalizedBase = clampScore(baseConfidence);
  const normalizedCoverage = Math.max(0, Math.min(1, coverage));
  return clampScore(normalizedBase * normalizedCoverage - Math.max(0, penaltyPoints));
}
