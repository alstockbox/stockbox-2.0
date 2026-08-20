import type { MissingDataImpact, MissingDataItem, MissingDataSeverity } from "./types";

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number | null, decimals = 4): number | null {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

export function calculateGrowth(
  current: number | null | undefined,
  prior: number | null | undefined,
): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(prior) || prior <= 0) {
    return null;
  }

  return current / prior - 1;
}

export function calculateCagr(
  start: number | null | undefined,
  end: number | null | undefined,
  years: number,
): number | null {
  if (!isFiniteNumber(start) || !isFiniteNumber(end) || start <= 0 || end <= 0 || years <= 0) {
    return null;
  }

  return end ** (1 / years) / start ** (1 / years) - 1;
}

export function scoreHigherIsBetter(value: number | null, weak: number, strong: number): number | null {
  if (!isFiniteNumber(value)) return null;
  if (strong === weak) return null;
  return clamp(((value - weak) / (strong - weak)) * 100, 0, 100);
}

export function scoreLowerIsBetter(value: number | null, weak: number, strong: number): number | null {
  if (!isFiniteNumber(value)) return null;
  if (weak === strong) return null;
  return clamp(((weak - value) / (weak - strong)) * 100, 0, 100);
}

export function scoreTargetRange(
  value: number | null,
  lowFail: number,
  lowIdeal: number,
  highIdeal: number,
  highFail: number,
): number | null {
  if (!isFiniteNumber(value)) return null;
  if (value >= lowIdeal && value <= highIdeal) return 100;
  if (value < lowIdeal) return scoreHigherIsBetter(value, lowFail, lowIdeal);
  return scoreLowerIsBetter(value, highFail, highIdeal);
}

export function weightedAverage(
  values: Array<{ value: number | null; weight: number }>,
): { score: number | null; coverage: number } {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  const available = values.filter((item) => isFiniteNumber(item.value));
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight <= 0 || availableWeight <= 0) {
    return { score: null, coverage: 0 };
  }

  const score =
    available.reduce((sum, item) => sum + (item.value as number) * item.weight, 0) / availableWeight;

  return { score: clamp(score, 0, 100), coverage: availableWeight / totalWeight };
}

export function firstFinite(...values: Array<number | null | undefined>): number | null {
  return values.find(isFiniteNumber) ?? null;
}

export function addMissingData(
  list: MissingDataItem[],
  field: string,
  reason: string,
  impact: MissingDataImpact,
  severity: MissingDataSeverity,
): void {
  if (list.some((item) => item.field === field && item.impact === impact)) {
    return;
  }

  list.push({ field, reason, impact, severity });
}

export function normalizeWeights<T extends string>(weights: Record<T, number>): Record<T, number> {
  const total = Object.values<number>(weights).reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return weights;
  }

  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, (value as number) / total]),
  ) as Record<T, number>;
}
