import { describe, expect, it } from "vitest";
import { evaluateIntelligenceSnapshots, type IntelligenceEvaluationSnapshot, type IntelligencePriceObservation } from "@/lib/analysis/intelligence-evaluation";

const snapshots: IntelligenceEvaluationSnapshot[] = [
  {
    ticker: "EARLY",
    asOf: "2026-01-01",
    priceAtSnapshot: 100,
    opportunityScore: 86,
    mispricingScore: 78,
    inflectionScore: 91,
    inputDates: ["2025-12-31", "2025-12-20"],
  },
  {
    ticker: "MIXED",
    asOf: "2026-01-01",
    priceAtSnapshot: 100,
    opportunityScore: 55,
    mispricingScore: 52,
    inflectionScore: 58,
    inputDates: ["2025-12-30"],
  },
];

const prices: IntelligencePriceObservation[] = [
  { ticker: "EARLY", date: "2026-01-31", price: 110 },
  { ticker: "EARLY", date: "2026-04-01", price: 125 },
  { ticker: "EARLY", date: "2026-06-30", price: 140 },
  { ticker: "MIXED", date: "2026-01-31", price: 96 },
  { ticker: "MIXED", date: "2026-04-01", price: 92 },
  { ticker: "MIXED", date: "2026-06-30", price: 94 },
];

describe("evaluateIntelligenceSnapshots", () => {
  it("calculates point-in-time 1M, 3M and 6M outcomes by opportunity bucket", () => {
    const result = evaluateIntelligenceSnapshots(snapshots, prices);
    const high = result.buckets.find((bucket) => bucket.label === "80-100");
    const mixed = result.buckets.find((bucket) => bucket.label === "40-59");

    expect(high?.snapshotCount).toBe(1);
    expect(high?.horizons.oneMonth.averageReturn).toBeCloseTo(0.1, 6);
    expect(high?.horizons.threeMonth.averageReturn).toBeCloseTo(0.25, 6);
    expect(high?.horizons.sixMonth.averageReturn).toBeCloseTo(0.4, 6);
    expect(high?.horizons.sixMonth.positiveRate).toBe(1);

    expect(mixed?.snapshotCount).toBe(1);
    expect(mixed?.horizons.oneMonth.averageReturn).toBeCloseTo(-0.04, 6);
    expect(mixed?.horizons.sixMonth.averageReturn).toBeCloseTo(-0.06, 6);
    expect(mixed?.horizons.sixMonth.positiveRate).toBe(0);
  });

  it("rejects snapshots whose model inputs are dated after the snapshot", () => {
    expect(() => evaluateIntelligenceSnapshots([
      {
        ...snapshots[0],
        inputDates: ["2025-12-31", "2026-01-02"],
      },
    ], prices)).toThrow(/future/i);
  });

  it("does not use an observation before the target horizon as the future outcome", () => {
    const result = evaluateIntelligenceSnapshots([
      {
        ...snapshots[0],
        ticker: "STRICT",
      },
    ], [
      { ticker: "STRICT", date: "2026-01-29", price: 150 },
      { ticker: "STRICT", date: "2026-02-01", price: 108 },
    ]);
    const high = result.buckets.find((bucket) => bucket.label === "80-100");

    expect(high?.horizons.oneMonth.averageReturn).toBeCloseTo(0.08, 6);
  });

  it("reports missing horizons instead of fabricating returns", () => {
    const result = evaluateIntelligenceSnapshots([snapshots[0]], []);
    const high = result.buckets.find((bucket) => bucket.label === "80-100");

    expect(high?.horizons.oneMonth.observationCount).toBe(0);
    expect(high?.horizons.oneMonth.averageReturn).toBeNull();
    expect(high?.horizons.sixMonth.positiveRate).toBeNull();
  });
});
