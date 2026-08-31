export type EstimateSnapshotPoint = {
  capturedAt: string;
  revenueConsensus: number | null;
  epsConsensus: number | null;
  targetPrice: number | null;
  analystCount: number | null;
  highEstimate: number | null;
  lowEstimate: number | null;
};

type Revision = { previous: number; current: number; change: number; previousAt: string; currentAt: string };

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function comparable(points: EstimateSnapshotPoint[], key: "revenueConsensus" | "epsConsensus" | "targetPrice", now: Date, days: number): Revision | null {
  const sorted = [...points].sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt));
  const current = [...sorted].reverse().find((point)=>finite(point[key]));
  if (!current || !finite(current[key])) return null;
  const cutoff = now.getTime() - days * 86_400_000;
  const previous = [...sorted].reverse().find((point)=>Date.parse(point.capturedAt) <= cutoff && finite(point[key]));
  if (!previous || !finite(previous[key]) || previous[key] === 0) return null;
  return { previous: previous[key], current: current[key], change: current[key] / Math.abs(previous[key]) - Math.sign(previous[key]), previousAt: previous.capturedAt, currentAt: current.capturedAt };
}

function metricSummary(points: EstimateSnapshotPoint[], key: "revenueConsensus" | "epsConsensus" | "targetPrice", now: Date) {
  return { days7: comparable(points,key,now,7), days30: comparable(points,key,now,30), days90: comparable(points,key,now,90) };
}

export function buildEstimateRevisionSummary(points: EstimateSnapshotPoint[], now = new Date()) {
  const revenue = metricSummary(points,"revenueConsensus",now);
  const eps = metricSummary(points,"epsConsensus",now);
  const target = metricSummary(points,"targetPrice",now);
  const signals = [revenue.days30?.change, eps.days30?.change, target.days30?.change, revenue.days90?.change, eps.days90?.change]
    .filter((value): value is number => finite(value));
  const average = signals.length ? signals.reduce((sum,value)=>sum+value,0)/signals.length : 0;
  const positive = signals.filter((value)=>value > 0.01).length;
  const negative = signals.filter((value)=>value < -0.01).length;
  let label: "Strong Positive" | "Positive" | "Neutral" | "Negative" | "Strong Negative" = "Neutral";
  if (signals.length >= 2 && average >= 0.08 && positive >= Math.ceil(signals.length * 0.6)) label = "Strong Positive";
  else if (average >= 0.02 && positive > negative) label = "Positive";
  else if (signals.length >= 2 && average <= -0.08 && negative >= Math.ceil(signals.length * 0.6)) label = "Strong Negative";
  else if (average <= -0.02 && negative > positive) label = "Negative";
  return {
    revenue,
    eps,
    target,
    momentum: {
      label,
      averageRevision: signals.length ? average : null,
      upwardSignals: positive,
      downwardSignals: negative,
      observedSignals: signals.length,
      explanation: signals.length ? `${positive} upward and ${negative} downward comparable revision signals; mean revision ${(average*100).toFixed(1)}%.` : "No comparable historical estimate snapshots are available.",
    },
  };
}
