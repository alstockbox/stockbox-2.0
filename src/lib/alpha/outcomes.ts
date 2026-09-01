export type AlphaOutcomeHorizonDays = 30 | 90 | 180 | 365;

export type AlphaOutcomeInput = {
  predictionId: string;
  predictionAsOf: string;
  horizonDays: AlphaOutcomeHorizonDays;
  priceStart: number;
  priceEnd: number;
  marketDataAsOf: string;
  predictedUp25: number;
  benchmarkSymbol?: string | null;
  benchmarkReturn?: number | null;
  maxLagDays?: number;
};

export type EvaluatedAlphaOutcome = {
  predictionId: string;
  horizonDays: AlphaOutcomeHorizonDays;
  priceStart: number;
  priceEnd: number;
  observedReturn: number;
  predictedUp25: number;
  hitUp25: boolean;
  benchmarkSymbol: string | null;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  marketDataAsOf: string;
};

export type AlphaCalibrationSummary = {
  count: number;
  hitRateUp25: number | null;
  meanPredictedUp25: number | null;
  meanReturn: number | null;
  medianReturn: number | null;
  brierUp25: number | null;
};

export type MaturedOutcomeWindow = {
  horizonDays: AlphaOutcomeHorizonDays;
  predictionFrom: string;
  predictionTo: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const OUTCOME_HORIZONS: AlphaOutcomeHorizonDays[] = [30, 90, 180, 365];

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function selectMaturedOutcomeWindows(now: string, maxLagDays = 7): MaturedOutcomeWindow[] {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("Outcome scheduling requires a valid current timestamp.");
  const lagDays = Math.max(0, Math.floor(maxLagDays));
  return OUTCOME_HORIZONS.map((horizonDays) => ({
    horizonDays,
    predictionFrom: new Date(nowMs - (horizonDays + lagDays) * DAY_MS).toISOString(),
    predictionTo: new Date(nowMs - horizonDays * DAY_MS).toISOString(),
  }));
}

export function evaluateAlphaOutcome(input: AlphaOutcomeInput): EvaluatedAlphaOutcome | null {
  const predictedAt = Date.parse(input.predictionAsOf);
  const observedAt = Date.parse(input.marketDataAsOf);
  if (!Number.isFinite(predictedAt) || !Number.isFinite(observedAt)) return null;
  if (!finitePositive(input.priceStart) || !finitePositive(input.priceEnd)) return null;
  if (!Number.isFinite(input.predictedUp25)) return null;

  const targetAt = predictedAt + input.horizonDays * DAY_MS;
  const maxLagDays = Math.max(0, Math.floor(input.maxLagDays ?? 7));
  if (observedAt < targetAt || observedAt > targetAt + maxLagDays * DAY_MS) return null;

  const observedReturn = input.priceEnd / input.priceStart - 1;
  const benchmarkReturn = typeof input.benchmarkReturn === "number" && Number.isFinite(input.benchmarkReturn)
    ? input.benchmarkReturn
    : null;

  return {
    predictionId: input.predictionId,
    horizonDays: input.horizonDays,
    priceStart: input.priceStart,
    priceEnd: input.priceEnd,
    observedReturn,
    predictedUp25: clamp01(input.predictedUp25),
    hitUp25: observedReturn >= 0.25,
    benchmarkSymbol: input.benchmarkSymbol ?? null,
    benchmarkReturn,
    excessReturn: benchmarkReturn === null ? null : observedReturn - benchmarkReturn,
    marketDataAsOf: input.marketDataAsOf,
  };
}

export function summarizeAlphaOutcomes(
  outcomes: Array<Pick<EvaluatedAlphaOutcome, "observedReturn" | "predictedUp25" | "hitUp25">>,
): AlphaCalibrationSummary {
  const usable = outcomes.filter((row) =>
    Number.isFinite(row.observedReturn)
    && Number.isFinite(row.predictedUp25),
  );
  if (!usable.length) {
    return {
      count: 0,
      hitRateUp25: null,
      meanPredictedUp25: null,
      meanReturn: null,
      medianReturn: null,
      brierUp25: null,
    };
  }

  const count = usable.length;
  const hitRateUp25 = usable.filter((row) => row.hitUp25).length / count;
  const meanPredictedUp25 = usable.reduce((sum, row) => sum + clamp01(row.predictedUp25), 0) / count;
  const meanReturn = usable.reduce((sum, row) => sum + row.observedReturn, 0) / count;
  const sortedReturns = usable.map((row) => row.observedReturn).sort((a, b) => a - b);
  const middle = Math.floor(count / 2);
  const medianReturn = count % 2
    ? sortedReturns[middle]!
    : (sortedReturns[middle - 1]! + sortedReturns[middle]!) / 2;
  const brierUp25 = usable.reduce((sum, row) => {
    const observed = row.hitUp25 ? 1 : 0;
    const predicted = clamp01(row.predictedUp25);
    return sum + (predicted - observed) ** 2;
  }, 0) / count;

  return { count, hitRateUp25, meanPredictedUp25, meanReturn, medianReturn, brierUp25 };
}
