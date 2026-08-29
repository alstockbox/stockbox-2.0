export type EvaluationObservation = {
  score: number;
  future12mExcessReturn?: number | null;
  future36mExcessReturn?: number | null;
  maxDrawdown?: number | null;
  hit?: boolean | null;
  priorScore?: number | null;
  sector?: string;
  coverage?: number | null;
};

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function ranks(values: number[]): number[] {
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value);
  const result = new Array<number>(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value) end += 1;
    const averageRank = ((start + 1) + end) / 2;
    for (let index = start; index < end; index += 1) result[ordered[index].index] = averageRank;
    start = end;
  }
  return result;
}

export function spearmanRankCorrelation(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2 || [...left, ...right].some((value) => !Number.isFinite(value))) return null;
  const a = ranks(left);
  const b = ranks(right);
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  const covariance = a.reduce((sum, value, index) => sum + (value - meanA) * (b[index] - meanB), 0);
  const varianceA = a.reduce((sum, value) => sum + (value - meanA) ** 2, 0);
  const varianceB = b.reduce((sum, value) => sum + (value - meanB) ** 2, 0);
  const denominator = Math.sqrt(varianceA * varianceB);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  const correlation = covariance / denominator;
  return Number.isFinite(correlation) ? correlation : null;
}

export function evaluateScoreModel(observations: EvaluationObservation[]) {
  const ordered = [...observations].sort((a, b) => a.score - b.score);
  const quintiles = Array.from({ length: 5 }, (_, index) => {
    const bucket = ordered.filter((_, itemIndex) => Math.min(4, Math.floor((itemIndex * 5) / Math.max(ordered.length, 1))) === index);
    return {
      quintile: index + 1,
      count: bucket.length,
      future12mExcessReturn: mean(bucket.map((item) => item.future12mExcessReturn).filter((value): value is number => typeof value === "number")),
      future36mExcessReturn: mean(bucket.map((item) => item.future36mExcessReturn).filter((value): value is number => typeof value === "number")),
    };
  });
  const with12m = observations.filter((item): item is EvaluationObservation & { future12mExcessReturn: number } => typeof item.future12mExcessReturn === "number");
  return {
    quintiles,
    informationCoefficient12m: spearmanRankCorrelation(with12m.map((item) => item.score), with12m.map((item) => item.future12mExcessReturn)),
    maximumDrawdown: mean(observations.map((item) => item.maxDrawdown).filter((value): value is number => typeof value === "number")),
    hitRate: mean(observations.map((item) => item.hit).filter((value): value is boolean => typeof value === "boolean").map(Number)),
    scoreStability: mean(observations.filter((item) => typeof item.priorScore === "number").map((item) => Math.abs(item.score - (item.priorScore as number)))),
    sectorCoverage: Object.fromEntries([...new Set(observations.map((item) => item.sector).filter(Boolean))].map((sector) => [sector, mean(observations.filter((item) => item.sector === sector).map((item) => item.coverage).filter((value): value is number => typeof value === "number"))])),
  };
}
