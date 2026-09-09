import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import { RECOMMENDATION_OUTCOME_POLICY_VERSION } from "@/lib/analysis/recommendation-learning-v3";

const { atomicRead } = vi.hoisted(() => ({ atomicRead: vi.fn() }));
vi.mock("@/lib/db/recommendation-performance-rollups-v3", () => ({
  readRecommendationPerformanceRollupSnapshotV3: atomicRead,
}));

import {
  readRecommendationPerformanceRollupSnapshotForReportingV3,
  validateRecommendationPerformanceRollupSnapshotForReportingV3,
} from "@/lib/db/recommendation-performance-rollup-reporting-reader-v3";

const HOUR_MS = 60 * 60 * 1_000;

function row(overrides: Record<string, unknown> = {}) {
  return {
    scope: "BASE" as const,
    horizon: "30d" as const,
    rating: "BUY" as const,
    sector: null,
    analysisArchetype: null,
    modelVersion: null,
    recommendationPolicyVersion: null,
    sampleCount: 40,
    benchmarkCount: 35,
    directionalCount: 30,
    hitRate: null,
    meanSecurityReturn: null,
    meanExcessReturn: null,
    medianExcessReturn: null,
    evaluatedAt: "2026-09-09T14:30:00.000Z",
    ...overrides,
  };
}

function snapshot(rollups = [row()]) {
  return {
    evaluatedAt: "2026-09-09T14:30:00.000Z",
    outcomePolicyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    benchmarkPolicyVersion: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
    sourceLimit: 5_000,
    dimensionSampleGate: 30,
    rollups,
  };
}

describe("Recommendation performance reporting reader V3", () => {
  beforeEach(() => atomicRead.mockReset());

  it("requires the reporting consumer to state freshness without leaking that policy into the atomic RPC reader", async () => {
    atomicRead.mockResolvedValue({ ok: true, configured: true, snapshot: snapshot() });

    const result = await readRecommendationPerformanceRollupSnapshotForReportingV3({
      sourceLimit: 5_000,
      dimensionSampleGate: 30,
      maxAgeMs: HOUR_MS,
      now: "2026-09-09T15:00:00.000Z",
    });

    expect(atomicRead).toHaveBeenCalledTimes(1);
    expect(atomicRead).toHaveBeenCalledWith({ sourceLimit: 5_000, dimensionSampleGate: 30 });
    expect(result).toMatchObject({ ok: true, configured: true, snapshot: { evaluatedAt: "2026-09-09T14:30:00.000Z" } });
  });

  it("fails closed when a materialized snapshot is older than the caller explicitly allows", async () => {
    atomicRead.mockResolvedValue({ ok: true, configured: true, snapshot: snapshot() });

    const result = await readRecommendationPerformanceRollupSnapshotForReportingV3({
      maxAgeMs: 2 * HOUR_MS,
      now: "2026-09-09T16:30:00.001Z",
    });

    expect(result).toEqual({
      ok: false,
      configured: true,
      snapshot: null,
      error: "STALE_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT",
    });
  });

  it("rejects duplicate logical rollups instead of double-counting a malformed snapshot", () => {
    const duplicate = row({ sampleCount: 999 });
    const result = validateRecommendationPerformanceRollupSnapshotForReportingV3(
      snapshot([row(), duplicate]),
      { maxAgeMs: HOUR_MS, now: "2026-09-09T15:00:00.000Z" },
    );

    expect(result).toEqual({
      ok: false,
      error: "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT",
    });
  });

  it("keeps a missing materialization distinct from staleness", async () => {
    atomicRead.mockResolvedValue({ ok: true, configured: true, snapshot: null });

    const result = await readRecommendationPerformanceRollupSnapshotForReportingV3({
      maxAgeMs: 0,
      now: "2026-09-09T15:00:00.000Z",
    });

    expect(result).toEqual({ ok: true, configured: true, snapshot: null });
  });

  it("fails closed for an invalid caller freshness policy without repairing it", async () => {
    atomicRead.mockResolvedValue({ ok: true, configured: true, snapshot: snapshot() });

    const result = await readRecommendationPerformanceRollupSnapshotForReportingV3({
      maxAgeMs: Number.NaN,
      now: "2026-09-09T15:00:00.000Z",
    });

    expect(result).toEqual({
      ok: false,
      configured: true,
      snapshot: null,
      error: "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_FRESHNESS_POLICY",
    });
  });
});
