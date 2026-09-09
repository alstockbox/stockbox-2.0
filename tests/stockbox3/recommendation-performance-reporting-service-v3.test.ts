import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import { RECOMMENDATION_OUTCOME_POLICY_VERSION } from "@/lib/analysis/recommendation-learning-v3";
import type {
  RecommendationPerformanceRollupReadRowV3,
  RecommendationPerformanceRollupSnapshotV3,
} from "@/lib/db/recommendation-performance-rollups-v3";

const { reportingRead } = vi.hoisted(() => ({ reportingRead: vi.fn() }));
vi.mock("@/lib/db/recommendation-performance-rollup-reporting-reader-v3", () => ({
  readRecommendationPerformanceRollupSnapshotForReportingV3: reportingRead,
}));

import { readRecommendationPerformanceReportV3 } from "@/lib/monitoring/recommendation-performance-reporting-service-v3";

function row(
  overrides: Partial<RecommendationPerformanceRollupReadRowV3> = {},
): RecommendationPerformanceRollupReadRowV3 {
  return {
    scope: "BASE",
    horizon: "30d",
    rating: "BUY",
    sector: null,
    analysisArchetype: null,
    modelVersion: null,
    recommendationPolicyVersion: null,
    sampleCount: 40,
    benchmarkCount: 35,
    directionalCount: 30,
    hitRate: 0.6,
    meanSecurityReturn: 0.08,
    meanExcessReturn: 0.03,
    medianExcessReturn: 0.02,
    evaluatedAt: "2026-09-09T15:00:00.000Z",
    ...overrides,
  };
}

function snapshot(
  rollups: RecommendationPerformanceRollupReadRowV3[] = [row()],
): RecommendationPerformanceRollupSnapshotV3 {
  return {
    evaluatedAt: "2026-09-09T15:00:00.000Z",
    outcomePolicyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    benchmarkPolicyVersion: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
    sourceLimit: 5_000,
    dimensionSampleGate: 30,
    rollups,
  };
}

const options = {
  sourceLimit: 5_000,
  dimensionSampleGate: 30,
  maxAgeMs: 60 * 60 * 1_000,
  now: "2026-09-09T15:30:00.000Z",
};

describe("Recommendation performance reporting service V3", () => {
  beforeEach(() => reportingRead.mockReset());

  it("returns one exact slice with snapshot lineage and passes freshness policy unchanged", async () => {
    const sector = row({ scope: "SECTOR", sector: "Industrials", sampleCount: 31 });
    reportingRead.mockResolvedValue({
      ok: true,
      configured: true,
      snapshot: snapshot([row(), sector]),
    });

    const result = await readRecommendationPerformanceReportV3(
      { scope: "SECTOR", horizon: "30d", rating: "BUY", sector: "Industrials" },
      options,
    );

    expect(reportingRead).toHaveBeenCalledTimes(1);
    expect(reportingRead).toHaveBeenCalledWith(options);
    expect(result).toEqual({
      ok: true,
      configured: true,
      lineage: {
        evaluatedAt: "2026-09-09T15:00:00.000Z",
        outcomePolicyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
        benchmarkPolicyVersion: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
        sourceLimit: 5_000,
        dimensionSampleGate: 30,
      },
      rollup: sector,
    });
  });

  it("never falls back to BASE when a requested dimension is absent", async () => {
    reportingRead.mockResolvedValue({ ok: true, configured: true, snapshot: snapshot([row()]) });

    const result = await readRecommendationPerformanceReportV3(
      { scope: "SECTOR", horizon: "30d", rating: "BUY", sector: "Technology" },
      options,
    );

    expect(result).toEqual({ ok: false, configured: true, reason: "NOT_FOUND" });
  });

  it("keeps an absent materialized snapshot distinct from read failure", async () => {
    reportingRead.mockResolvedValue({ ok: true, configured: true, snapshot: null });

    const result = await readRecommendationPerformanceReportV3(
      { scope: "BASE", horizon: "30d", rating: "BUY" },
      options,
    );

    expect(result).toEqual({ ok: false, configured: true, reason: "SNAPSHOT_UNAVAILABLE" });
  });

  it("preserves fail-closed snapshot freshness/read errors", async () => {
    reportingRead.mockResolvedValue({
      ok: false,
      configured: true,
      snapshot: null,
      error: "STALE_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT",
    });

    const result = await readRecommendationPerformanceReportV3(
      { scope: "BASE", horizon: "30d", rating: "BUY" },
      options,
    );

    expect(result).toEqual({
      ok: false,
      configured: true,
      reason: "SNAPSHOT_READ_FAILED",
      error: "STALE_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT",
    });
  });

  it("preserves unconfigured admin storage as an explicit state", async () => {
    reportingRead.mockResolvedValue({
      ok: false,
      configured: false,
      snapshot: null,
      error: "SUPABASE_ADMIN_NOT_CONFIGURED",
    });

    const result = await readRecommendationPerformanceReportV3(
      { scope: "BASE", horizon: "30d", rating: "BUY" },
      options,
    );

    expect(result).toEqual({
      ok: false,
      configured: false,
      reason: "NOT_CONFIGURED",
      error: "SUPABASE_ADMIN_NOT_CONFIGURED",
    });
  });

  it("keeps null metrics as missing evidence through the service boundary", async () => {
    const base = row({
      hitRate: null,
      meanSecurityReturn: null,
      meanExcessReturn: null,
      medianExcessReturn: null,
    });
    reportingRead.mockResolvedValue({ ok: true, configured: true, snapshot: snapshot([base]) });

    const result = await readRecommendationPerformanceReportV3(
      { scope: "BASE", horizon: "30d", rating: "BUY" },
      options,
    );

    expect(result).toMatchObject({
      ok: true,
      rollup: {
        hitRate: null,
        meanSecurityReturn: null,
        meanExcessReturn: null,
        medianExcessReturn: null,
      },
    });
  });
});
