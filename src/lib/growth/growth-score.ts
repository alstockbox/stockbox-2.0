export const EARLY_GROWTH_WEIGHTS = {
  qualifiedVisits: 0.30,
  ctr: 0.25,
  signupConversion: 0.20,
  engagement: 0.10,
  activationConversion: 0.10,
  costEfficiency: 0.05,
} as const;

export type GrowthMetricKey = keyof typeof EARLY_GROWTH_WEIGHTS | string;
export type GrowthMetrics = Partial<Record<GrowthMetricKey, number | null | undefined>>;
export type GrowthWeights = Record<string, number>;

export type GrowthScoreResult = {
  score: number;
  usedMetrics: string[];
  normalizedWeights: Record<string, number>;
  contributions: Record<string, number>;
};

function clamp100(value: number) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

export function calculateGrowthScore(
  metrics: GrowthMetrics,
  weights: GrowthWeights = EARLY_GROWTH_WEIGHTS,
): GrowthScoreResult {
  const usable = Object.entries(weights)
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    .map(([key, weight]) => {
      const raw = metrics[key];
      return {
        key,
        weight,
        value: raw === null || raw === undefined ? null : clamp100(Number(raw)),
      };
    })
    .filter((item): item is { key: string; weight: number; value: number } => item.value !== null);

  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  if (usable.length === 0 || totalWeight <= 0) {
    return { score: 0, usedMetrics: [], normalizedWeights: {}, contributions: {} };
  }

  const normalizedWeights: Record<string, number> = {};
  const contributions: Record<string, number> = {};
  let score = 0;

  for (const item of usable) {
    const normalized = item.weight / totalWeight;
    const contribution = item.value * normalized;
    normalizedWeights[item.key] = normalized;
    contributions[item.key] = contribution;
    score += contribution;
  }

  return {
    score: Math.max(0, Math.min(100, Number(score.toFixed(4)))),
    usedMetrics: usable.map((item) => item.key),
    normalizedWeights,
    contributions,
  };
}
