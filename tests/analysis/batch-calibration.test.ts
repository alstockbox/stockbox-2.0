import { describe, expect, it } from "vitest";
import { compareBatchQaRuns, summarizeBatchQaResults } from "../../src/lib/analysis";
import type { BatchQaResult } from "../../src/lib/analysis";

const row = (score: number | null, flags: BatchQaResult["flags"] = [], rating: BatchQaResult["rating"] = score === null ? "No Rating" : "Hold"): BatchQaResult => ({
  batchId: "batch-1", rerunKey: "run-1", modelVersion: "v1", scorePolicyVersion: "policy-v1",
  benchmarkVersion: "bench-v1", canonicalInputFingerprint: "fixture-fingerprint", providerVersions: {},
  analysisTimestamp: "2026-08-25T00:00:00.000Z", canonicalEntity: crypto.randomUUID(),
  archetype: "standard", coverage: 0.8, confidence: 75, flags, score, rating,
});

describe("batch calibration summary", () => {
  it("summarizes score distribution and warning concentration", () => {
    const summary = summarizeBatchQaResults([
      row(20, ["LOW_COVERAGE"]), row(45), row(55, [], "No Rating"), row(75), row(85), row(null, ["VALUATION_UNAVAILABLE"]),
    ]);

    expect(summary.total).toBe(6);
    expect(summary.scored).toBe(5);
    expect(summary.meanScore).toBe(56);
    expect(summary.medianScore).toBe(55);
    expect(summary.scoreBands).toEqual({ "0-39": 1, "40-59": 2, "60-79": 1, "80-100": 1 });
    expect(summary.noRatingCount).toBe(2);
    expect(summary.noRatingRate).toBeCloseTo(2 / 6, 10);
    expect(summary.p10).toBe(30);
    expect(summary.p25).toBe(45);
    expect(summary.p75).toBe(75);
    expect(summary.p90).toBe(81);
    expect(summary.standardDeviation).toBeGreaterThan(0);
    expect(summary.flagCounts.LOW_COVERAGE).toBe(1);
    expect(summary.flagCounts.VALUATION_UNAVAILABLE).toBe(1);
  });
});

describe("batch calibration drift", () => {
  it("compares repeat runs by canonical entity", () => {
    const previous = [
      { ...row(60), canonicalEntity: "listing:AAPL", coverage: 0.8, confidence: 75 },
      { ...row(null, ["VALUATION_UNAVAILABLE"]), canonicalEntity: "listing:O", coverage: 0.4, confidence: 70 },
    ];
    const current = [
      { ...row(66, ["SOURCE_CONFLICT"], "Buy"), canonicalEntity: "listing:AAPL", coverage: 0.82, confidence: 78 },
      { ...row(50, [], "Hold"), canonicalEntity: "listing:O", archetype: "reit" as const, coverage: 0.45, confidence: 72 },
      { ...row(64), canonicalEntity: "listing:XOM" },
    ];
    const drift = compareBatchQaRuns(previous, current);
    expect(drift.matched).toBe(2);
    expect(drift.addedEntities).toEqual(["listing:XOM"]);
    expect(drift.removedEntities).toEqual([]);
    expect(drift.ratingChanges).toEqual([
      { canonicalEntity: "listing:AAPL", from: "Hold", to: "Buy" },
      { canonicalEntity: "listing:O", from: "No Rating", to: "Hold" },
    ]);
    expect(drift.meanAbsoluteScoreDelta).toBe(6);
    expect(drift.meanSignedScoreDelta).toBe(6);
    expect(drift.maxAbsoluteScoreDelta).toBe(6);
    expect(drift.scoreDeltas).toEqual([{ canonicalEntity: "listing:AAPL", from: 60, to: 66, delta: 6 }]);
    expect(drift.scoreAvailabilityChanges).toEqual([{ canonicalEntity: "listing:O", from: false, to: true }]);
    expect(drift.noRatingTransitions).toEqual([{ canonicalEntity: "listing:O", from: true, to: false }]);
    expect(drift.archetypeChanges).toEqual([{ canonicalEntity: "listing:O", from: "standard", to: "reit" }]);
    expect(drift.meanCoverageDelta).toBeCloseTo(0.035, 10);
    expect(drift.meanConfidenceDelta).toBe(2.5);
    expect(drift.flagChanges).toHaveLength(2);
  });
});
