export type IntelligenceEvaluationSnapshot = {
  ticker: string;
  asOf: string;
  priceAtSnapshot: number;
  opportunityScore: number;
  mispricingScore: number;
  inflectionScore: number;
  inputDates: string[];
};

export type IntelligencePriceObservation = {
  ticker: string;
  date: string;
  price: number;
};

type EvaluationHorizon = {
  observationCount: number;
  averageReturn: number | null;
  positiveRate: number | null;
};

type EvaluationBucket = {
  label: "0-39" | "40-59" | "60-79" | "80-100";
  snapshotCount: number;
  horizons: {
    oneMonth: EvaluationHorizon;
    threeMonth: EvaluationHorizon;
    sixMonth: EvaluationHorizon;
  };
};

export type IntelligenceEvaluationResult = {
  snapshotCount: number;
  buckets: EvaluationBucket[];
};

const DAY_MS = 86_400_000;
const HORIZONS = {
  oneMonth: 30,
  threeMonth: 90,
  sixMonth: 180,
} as const;

function parseDateOnly(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date: ${value}`);
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid date: ${value}`);
  return timestamp;
}

function validateSnapshot(snapshot: IntelligenceEvaluationSnapshot) {
  const asOf = parseDateOnly(snapshot.asOf);
  if (!Number.isFinite(snapshot.priceAtSnapshot) || snapshot.priceAtSnapshot <= 0) {
    throw new Error(`Invalid snapshot price for ${snapshot.ticker}.`);
  }
  for (const inputDate of snapshot.inputDates) {
    if (parseDateOnly(inputDate) > asOf) {
      throw new Error(`Future-dated model input detected for ${snapshot.ticker}: ${inputDate} is after ${snapshot.asOf}.`);
    }
  }
  return asOf;
}

function bucketLabel(score: number): EvaluationBucket["label"] {
  if (score < 40) return "0-39";
  if (score < 60) return "40-59";
  if (score < 80) return "60-79";
  return "80-100";
}

function emptyHorizon(): EvaluationHorizon {
  return { observationCount: 0, averageReturn: null, positiveRate: null };
}

function emptyBucket(label: EvaluationBucket["label"]): EvaluationBucket {
  return {
    label,
    snapshotCount: 0,
    horizons: {
      oneMonth: emptyHorizon(),
      threeMonth: emptyHorizon(),
      sixMonth: emptyHorizon(),
    },
  };
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function evaluateIntelligenceSnapshots(
  snapshots: IntelligenceEvaluationSnapshot[],
  prices: IntelligencePriceObservation[],
): IntelligenceEvaluationResult {
  const labels: EvaluationBucket["label"][] = ["0-39", "40-59", "60-79", "80-100"];
  const buckets = new Map(labels.map((label) => [label, emptyBucket(label)]));
  const returns = new Map(labels.map((label) => [label, {
    oneMonth: [] as number[],
    threeMonth: [] as number[],
    sixMonth: [] as number[],
  }]));

  const pricesByTicker = new Map<string, Array<{ timestamp: number; price: number }>>();
  for (const observation of prices) {
    if (!Number.isFinite(observation.price) || observation.price <= 0) continue;
    const timestamp = parseDateOnly(observation.date);
    const ticker = observation.ticker.trim().toUpperCase();
    const list = pricesByTicker.get(ticker) ?? [];
    list.push({ timestamp, price: observation.price });
    pricesByTicker.set(ticker, list);
  }
  for (const list of pricesByTicker.values()) list.sort((a, b) => a.timestamp - b.timestamp);

  for (const snapshot of snapshots) {
    const asOf = validateSnapshot(snapshot);
    const label = bucketLabel(Math.max(0, Math.min(100, snapshot.opportunityScore)));
    const bucket = buckets.get(label)!;
    bucket.snapshotCount += 1;
    const tickerPrices = pricesByTicker.get(snapshot.ticker.trim().toUpperCase()) ?? [];

    for (const [key, days] of Object.entries(HORIZONS) as Array<[keyof typeof HORIZONS, number]>) {
      const target = asOf + days * DAY_MS;
      // Use the first observation on/after the target date. Never pull an earlier price
      // backward into the outcome window, because that would shorten the measured horizon.
      const future = tickerPrices.find((item) => item.timestamp >= target);
      if (!future) continue;
      const realizedReturn = future.price / snapshot.priceAtSnapshot - 1;
      returns.get(label)![key].push(realizedReturn);
    }
  }

  for (const label of labels) {
    const bucket = buckets.get(label)!;
    const bucketReturns = returns.get(label)!;
    for (const key of Object.keys(HORIZONS) as Array<keyof typeof HORIZONS>) {
      const values = bucketReturns[key];
      bucket.horizons[key] = {
        observationCount: values.length,
        averageReturn: average(values),
        positiveRate: values.length ? values.filter((value) => value > 0).length / values.length : null,
      };
    }
  }

  return {
    snapshotCount: snapshots.length,
    buckets: labels.map((label) => buckets.get(label)!),
  };
}
