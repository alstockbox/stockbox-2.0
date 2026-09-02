export type InvestorScoreInput = {
  thesisClarity: number;
  riskAwareness: number;
  valuationDiscipline: number;
  positionSizing: number;
  reviewDiscipline: number;
  learningConsistency: number;
  outcomeQuality: number;
  sampleSize: number;
};

export type InvestorScore = {
  scoringVersion: "process-v1";
  processScore: number | null;
  reliability: "insufficient_data" | "early" | "developing" | "reliable";
  dimensions: {
    thesisClarity: number;
    riskAwareness: number;
    valuationDiscipline: number;
    positionSizing: number;
    reviewDiscipline: number;
    learningConsistency: number;
    outcomeQuality: number;
  };
  explanation: string[];
};

type ScoreDimensionKey = Exclude<keyof InvestorScoreInput, "sampleSize">;

const WEIGHTS = {
  thesisClarity: 0.18,
  riskAwareness: 0.17,
  valuationDiscipline: 0.16,
  positionSizing: 0.14,
  reviewDiscipline: 0.15,
  learningConsistency: 0.12,
  outcomeQuality: 0.08
} satisfies Record<ScoreDimensionKey, number>;

export function calculateInvestorScore(input: InvestorScoreInput): InvestorScore {
  const dimensions = {
    thesisClarity: clampScore(input.thesisClarity),
    riskAwareness: clampScore(input.riskAwareness),
    valuationDiscipline: clampScore(input.valuationDiscipline),
    positionSizing: clampScore(input.positionSizing),
    reviewDiscipline: clampScore(input.reviewDiscipline),
    learningConsistency: clampScore(input.learningConsistency),
    outcomeQuality: clampScore(input.outcomeQuality)
  };
  const reliability = reliabilityFromSampleSize(input.sampleSize);

  if (reliability === "insufficient_data") {
    return {
      scoringVersion: "process-v1",
      processScore: null,
      reliability,
      dimensions,
      explanation: ["Minst tre låsta beslut krävs innan StockBox visar en process-score."]
    };
  }

  const processScore = Math.round(
    dimensions.thesisClarity * WEIGHTS.thesisClarity +
      dimensions.riskAwareness * WEIGHTS.riskAwareness +
      dimensions.valuationDiscipline * WEIGHTS.valuationDiscipline +
      dimensions.positionSizing * WEIGHTS.positionSizing +
      dimensions.reviewDiscipline * WEIGHTS.reviewDiscipline +
      dimensions.learningConsistency * WEIGHTS.learningConsistency +
      dimensions.outcomeQuality * WEIGHTS.outcomeQuality
  );

  return {
    scoringVersion: "process-v1",
    processScore,
    reliability,
    dimensions,
    explanation: buildScoreExplanation(dimensions)
  };
}

function reliabilityFromSampleSize(sampleSize: number): InvestorScore["reliability"] {
  if (sampleSize < 3) return "insufficient_data";
  if (sampleSize < 10) return "early";
  if (sampleSize < 25) return "developing";
  return "reliable";
}

function buildScoreExplanation(dimensions: InvestorScore["dimensions"]) {
  const entries = Object.entries(dimensions).sort((a, b) => b[1] - a[1]);
  const strongest = entries[0];
  const weakest = entries.at(-1);
  return [
    `Starkast just nu: ${label(strongest[0])} (${strongest[1]}/100).`,
    `Nästa förbättring: ${label(weakest![0])} (${weakest![1]}/100).`,
    "Outcome räknas, men väger lättare än beslutskvalitet och review-disciplin."
  ];
}

function label(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
