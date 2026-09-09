import { readdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationCalibrationCandidateV3 } from "@/lib/analysis/recommendation-learning-v3";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));

import {
  persistRecommendationCalibrationCandidateV3,
  recommendationCalibrationCandidateKeyV3,
} from "@/lib/db/recommendation-calibration-v3";

function candidate(overrides: Partial<RecommendationCalibrationCandidateV3> = {}): RecommendationCalibrationCandidateV3 {
  return {
    policyVersion: "stockbox-recommendation-calibration-v3.0.0",
    candidateId: "standard:model-v3:policy-v3:30d:BUY:40:2026-09-09T14:00:00.000Z",
    createdAt: "2026-09-09T14:00:00.000Z",
    stage: "CANDIDATE",
    horizon: "30d",
    rating: "BUY",
    analysisArchetype: "standard",
    modelVersion: "model-v3",
    recommendationPolicyVersion: "policy-v3",
    sampleSize: 40,
    benchmarkSampleSize: 40,
    hitRate: 0.4,
    meanExcessReturn: -0.03,
    medianExcessReturn: -0.025,
    reasons: ["MEAN_EXCESS_RETURN_BELOW_MINUS_2_PERCENT"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({
    data: [{ stage: "CANDIDATE", created: false, refreshed: false }],
    error: null,
  });
  mocks.from.mockImplementation(() => {
    throw new Error("LEGACY_NON_ATOMIC_CANDIDATE_PERSISTENCE_USED");
  });
});

describe("Recommendation calibration concurrency V3", () => {
  it("persists candidates through one monotonic transactional RPC using evaluation time", async () => {
    const input = candidate();
    const result = await persistRecommendationCalibrationCandidateV3(input);

    expect(result).toEqual({
      ok: true,
      configured: true,
      created: false,
      refreshed: false,
      stage: "CANDIDATE",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "persist_recommendation_v3_calibration_candidate",
      {
        p_row: expect.objectContaining({
          candidate_key: recommendationCalibrationCandidateKeyV3(input),
          created_at: input.createdAt,
          updated_at: input.createdAt,
        }),
        p_evaluated_at: input.createdAt,
      },
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("defines a service-role-only row-locking RPC that refuses stale candidate refreshes", () => {
    const migrationText = readdirSync("supabase/migrations")
      .filter((name) => name.includes("recommendation_v3_calibration"))
      .sort()
      .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
      .join("\n")
      .toLowerCase();

    expect(migrationText).toContain("persist_recommendation_v3_calibration_candidate");
    expect(migrationText).toContain("for update");
    expect(migrationText).toContain("v_current_updated_at > p_evaluated_at");
    expect(migrationText).toContain("security definer");
    expect(migrationText).toContain("grant execute on function public.persist_recommendation_v3_calibration_candidate");
    expect(migrationText).toContain("to service_role");
  });
});
