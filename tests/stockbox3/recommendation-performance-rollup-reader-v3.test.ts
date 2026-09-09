import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import { RECOMMENDATION_OUTCOME_POLICY_VERSION } from "@/lib/analysis/recommendation-learning-v3";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import * as persistence from "@/lib/db/recommendation-performance-rollups-v3";

type Reader = (options?: { sourceLimit?: number; dimensionSampleGate?: number }) => Promise<unknown>;

function reader(): Reader | null {
  const candidate = (persistence as Record<string, unknown>).readRecommendationPerformanceRollupSnapshotV3;
  expect(candidate).toBeTypeOf("function");
  return typeof candidate === "function" ? candidate as Reader : null;
}

function payload(overrides: Record<string, unknown> = {}) {
  const evaluatedAt = "2026-09-09T14:30:00.000Z";
  return {
    snapshot_evaluated_at: evaluatedAt,
    outcome_policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
    source_limit: 5_000,
    dimension_sample_gate: 30,
    rollups: [{
      scope: "BASE",
      horizon: "30d",
      rating: "BUY",
      sector: null,
      analysis_archetype: null,
      model_version: null,
      recommendation_policy_version: null,
      outcome_policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
      benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
      source_limit: 5_000,
      dimension_sample_gate: 30,
      sample_count: 40,
      benchmark_count: 35,
      directional_count: 30,
      hit_rate: null,
      mean_security_return: null,
      mean_excess_return: null,
      median_excess_return: null,
      evaluated_at: evaluatedAt,
      updated_at: evaluatedAt,
    }],
    ...overrides,
  };
}

describe("Recommendation performance rollup snapshot reader V3", () => {
  beforeEach(() => rpc.mockReset());

  it("reads one exact private lineage through a single RPC and preserves missing metrics", async () => {
    const read = reader();
    if (!read) return;
    rpc.mockResolvedValue({ data: payload(), error: null });

    const result = await read({ sourceLimit: 5_000, dimensionSampleGate: 30 });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("read_recommendation_v3_performance_rollup_snapshot", {
      p_outcome_policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
      p_benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
      p_source_limit: 5_000,
      p_dimension_sample_gate: 30,
    });
    expect(result).toEqual({
      ok: true,
      configured: true,
      snapshot: {
        evaluatedAt: "2026-09-09T14:30:00.000Z",
        outcomePolicyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
        benchmarkPolicyVersion: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
        sourceLimit: 5_000,
        dimensionSampleGate: 30,
        rollups: [{
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
          hitRate: null,
          meanSecurityReturn: null,
          meanExcessReturn: null,
          medianExcessReturn: null,
          evaluatedAt: "2026-09-09T14:30:00.000Z",
        }],
      },
    });
  });

  it("distinguishes no materialized snapshot from a valid materialized empty snapshot", async () => {
    const read = reader();
    if (!read) return;
    rpc
      .mockResolvedValueOnce({
        data: payload({ snapshot_evaluated_at: null, rollups: [] }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: payload({ rollups: [] }),
        error: null,
      });

    const missing = await read({ sourceLimit: 5_000, dimensionSampleGate: 30 });
    const empty = await read({ sourceLimit: 5_000, dimensionSampleGate: 30 });

    expect(missing).toEqual({ ok: true, configured: true, snapshot: null });
    expect(empty).toMatchObject({
      ok: true,
      configured: true,
      snapshot: {
        evaluatedAt: "2026-09-09T14:30:00.000Z",
        rollups: [],
      },
    });
  });

  it("fails closed when a row does not belong to the frozen snapshot watermark", async () => {
    const read = reader();
    if (!read) return;
    const inconsistent = payload();
    const rollups = inconsistent.rollups as Array<Record<string, unknown>>;
    rollups[0] = { ...rollups[0], evaluated_at: "2026-09-09T14:29:00.000Z" };
    rpc.mockResolvedValue({ data: inconsistent, error: null });

    const result = await read({ sourceLimit: 5_000, dimensionSampleGate: 30 });

    expect(result).toEqual({
      ok: false,
      configured: true,
      snapshot: null,
      error: "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT",
    });
  });

  it("fails closed for malformed scope dimensions instead of repairing or inferring them", async () => {
    const read = reader();
    if (!read) return;
    const malformed = payload();
    const rollups = malformed.rollups as Array<Record<string, unknown>>;
    rollups[0] = { ...rollups[0], scope: "SECTOR", sector: null };
    rpc.mockResolvedValue({ data: malformed, error: null });

    const result = await read({ sourceLimit: 5_000, dimensionSampleGate: 30 });

    expect(result).toEqual({
      ok: false,
      configured: true,
      snapshot: null,
      error: "INVALID_RECOMMENDATION_PERFORMANCE_ROLLUP_SNAPSHOT",
    });
  });

  it("requires a service-role-only RPC that locks the same watermark lineage for the whole read", () => {
    const migrationsDir = join(process.cwd(), "supabase/migrations");
    const migrationName = readdirSync(migrationsDir)
      .find((name) => name.includes("recommendation_v3_performance_rollup_reader"));
    expect(migrationName).toBeTruthy();
    if (!migrationName) return;

    const migration = readFileSync(join(migrationsDir, migrationName), "utf8").toLowerCase();
    expect(migration).toContain("read_recommendation_v3_performance_rollup_snapshot");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("for share");
    expect(migration).toContain("analysis_recommendation_v3_performance_rollup_watermarks");
    expect(migration).toContain("analysis_recommendation_v3_performance_rollups");
    expect(migration).toContain("revoke all on function public.read_recommendation_v3_performance_rollup_snapshot");
    expect(migration).toContain("from authenticated");
    expect(migration).toContain("grant execute on function public.read_recommendation_v3_performance_rollup_snapshot");
    expect(migration).toContain("to service_role");
  });
});
