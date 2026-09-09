import { readdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationPerformanceRollupV3 } from "@/lib/analysis/recommendation-performance-rollup-v3";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({ upsert: mocks.upsert }),
  }),
}));

import { persistRecommendationPerformanceRollupsV3 } from "@/lib/db/recommendation-performance-rollups-v3";

const options = {
  sourceLimit: 5_000,
  dimensionSampleGate: 30,
  evaluatedAt: "2026-09-09T13:55:00.000Z",
};

function rollup(overrides: Partial<RecommendationPerformanceRollupV3> = {}): RecommendationPerformanceRollupV3 {
  return {
    scope: "SECTOR",
    horizon: "30d",
    rating: "BUY",
    sector: "technology",
    analysisArchetype: null,
    modelVersion: null,
    recommendationPolicyVersion: null,
    count: 40,
    benchmarkCount: 35,
    directionalCount: 30,
    hitRate: 0.6,
    meanSecurityReturn: 0.08,
    meanExcessReturn: 0.03,
    medianExcessReturn: 0.025,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: 1, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
});

describe("Recommendation performance rollup snapshot replacement V3", () => {
  it("replaces one complete evaluation through a single transactional RPC", async () => {
    const result = await persistRecommendationPerformanceRollupsV3([rollup()], options);

    expect(result).toEqual({ ok: true, configured: true, persisted: 1 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "replace_recommendation_v3_performance_rollups",
      expect.objectContaining({
        p_source_limit: 5_000,
        p_dimension_sample_gate: 30,
        p_evaluated_at: options.evaluatedAt,
        p_rows: expect.any(Array),
      }),
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("still executes replacement for an empty evaluation so stale rows are cleared", async () => {
    mocks.rpc.mockResolvedValue({ data: 0, error: null });

    const result = await persistRecommendationPerformanceRollupsV3([], options);

    expect(result).toEqual({ ok: true, configured: true, persisted: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "replace_recommendation_v3_performance_rollups",
      expect.objectContaining({ p_rows: [] }),
    );
  });

  it("defines the private transactional replacement function in an append-only migration", () => {
    const migrationText = readdirSync("supabase/migrations")
      .filter((name) => name.includes("recommendation_v3_performance_rollup"))
      .sort()
      .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
      .join("\n")
      .toLowerCase();

    expect(migrationText).toContain("replace_recommendation_v3_performance_rollups");
    expect(migrationText).toContain("delete from public.analysis_recommendation_v3_performance_rollups");
    expect(migrationText).toContain("jsonb_populate_recordset");
    expect(migrationText).toContain("security definer");
    expect(migrationText).toContain("grant execute on function public.replace_recommendation_v3_performance_rollups");
    expect(migrationText).toContain("to service_role");
  });
});
