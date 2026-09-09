import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  recommendationCalibrationCandidateKeyV3,
  toRecommendationCalibrationCandidateRowV3,
} from "@/lib/db/recommendation-calibration-v3";
import type { RecommendationCalibrationCandidateV3 } from "@/lib/analysis/recommendation-learning-v3";

function candidate(overrides: Partial<RecommendationCalibrationCandidateV3> = {}): RecommendationCalibrationCandidateV3 {
  return {
    policyVersion: "stockbox-recommendation-calibration-v3.0.0",
    candidateId: "standard:model-v3:policy-v3:30d:BUY:40:2026-09-08T12:00:00.000Z",
    createdAt: "2026-09-08T12:00:00.000Z",
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

const schemaMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260908222000_recommendation_v3_calibration.sql"),
  "utf8",
);
const rpcMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260908222500_recommendation_v3_calibration_advance_rpc.sql"),
  "utf8",
);
const creationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260908222600_recommendation_v3_calibration_creation_event.sql"),
  "utf8",
);
const evidenceMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260909103000_recommendation_v3_calibration_evidence.sql"),
  "utf8",
);
const medianMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260909113000_recommendation_v3_calibration_median.sql"),
  "utf8",
);

describe("Recommendation calibration V3 persistence", () => {
  it("uses stable model-lineage identity independent of evaluation timestamp and sample size", () => {
    const first = recommendationCalibrationCandidateKeyV3(candidate());
    const refreshed = recommendationCalibrationCandidateKeyV3(candidate({
      candidateId: "different-evaluation-artifact",
      createdAt: "2026-09-09T12:00:00.000Z",
      sampleSize: 75,
      benchmarkSampleSize: 74,
    }));
    const nextModel = recommendationCalibrationCandidateKeyV3(candidate({ modelVersion: "model-v4" }));

    expect(first).toBe(refreshed);
    expect(nextModel).not.toBe(first);
  });

  it("maps only objective aggregate calibration fields including durable median evidence", () => {
    const row = toRecommendationCalibrationCandidateRowV3(candidate());
    const serialized = JSON.stringify(row);

    expect(row.stage).toBe("CANDIDATE");
    expect(row.analysis_archetype).toBe("standard");
    expect(row.model_version).toBe("model-v3");
    expect(row.recommendation_policy_version).toBe("policy-v3");
    expect(row.mean_excess_return).toBe(-0.03);
    expect(row.median_excess_return).toBe(-0.025);
    expect(row.backtest_improved).toBeNull();
    expect(row.shadow_improved).toBeNull();
    expect(row.explicit_approval).toBe(false);
    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("personalized");
    expect(serialized).not.toContain("portfolio");
    expect(serialized).not.toContain("ai_output");
  });

  it("keeps legacy candidates missing median evidence as null rather than inventing zero", () => {
    const row = toRecommendationCalibrationCandidateRowV3(candidate({ medianExcessReturn: undefined }));
    expect(row.median_excess_return).toBeNull();
  });

  it("adds median evidence without weakening calibration table access controls", () => {
    expect(medianMigration).toContain("add column if not exists median_excess_return numeric");
    expect(medianMigration).toContain("missing data is never coerced to zero");
    expect(medianMigration).not.toContain("grant ");
  });

  it("keeps calibration tables private and events append-only", () => {
    expect(schemaMigration).toContain("enable row level security");
    expect(schemaMigration).toContain("revoke all on table public.analysis_recommendation_v3_calibration_candidates from authenticated");
    expect(schemaMigration).toContain("grant select, insert, update on table public.analysis_recommendation_v3_calibration_candidates to service_role");
    expect(schemaMigration).toContain("before update or delete on public.analysis_recommendation_v3_calibration_events");
    expect(schemaMigration).toContain("Recommendation calibration events are append-only");
  });

  it("enforces the full promotion chain again inside one transactional RPC", () => {
    expect(rpcMigration).toContain("for update");
    expect(rpcMigration).toContain("CALIBRATION_STAGE_CONFLICT");
    expect(rpcMigration).toContain("CALIBRATION_BACKTEST_IMPROVEMENT_REQUIRED");
    expect(rpcMigration).toContain("CALIBRATION_SHADOW_IMPROVEMENT_REQUIRED");
    expect(rpcMigration).toContain("CALIBRATION_EXPLICIT_APPROVAL_AND_EVIDENCE_REQUIRED");
    expect(rpcMigration).toContain("grant execute on function public.advance_recommendation_v3_calibration");
  });

  it("writes the initial candidate audit event in the insert transaction", () => {
    expect(creationMigration).toContain("after insert on public.analysis_recommendation_v3_calibration_candidates");
    expect(creationMigration).toContain("CALIBRATION_DRIFT_CANDIDATE_CREATED");
    expect(creationMigration).toContain("analysis_recommendation_v3_calibration_events");
  });

  it("persists immutable service-role-only backtest and shadow evidence instead of trusting booleans", () => {
    expect(evidenceMigration).toContain("analysis_recommendation_v3_calibration_evidence");
    expect(evidenceMigration).toContain("evidence_kind in ('BACKTEST', 'SHADOW')");
    expect(evidenceMigration).toContain("Recommendation calibration evidence is append-only");
    expect(evidenceMigration).toContain("enable row level security");
    expect(evidenceMigration).toContain("from authenticated");
    expect(evidenceMigration).toContain("to service_role");
    expect(evidenceMigration).toContain("CALIBRATION_EVIDENCE_LINEAGE_MISMATCH");
  });

  it("requires persisted evidence ids for promotion and makes approval explicit before production", () => {
    expect(evidenceMigration).toContain("p_backtest_evidence_id uuid");
    expect(evidenceMigration).toContain("p_shadow_evidence_id uuid");
    expect(evidenceMigration).toContain("CALIBRATION_BACKTEST_EVIDENCE_REQUIRED");
    expect(evidenceMigration).toContain("CALIBRATION_SHADOW_EVIDENCE_REQUIRED");
    expect(evidenceMigration).toContain("CALIBRATION_EXPLICIT_APPROVAL_REQUIRED");
    expect(evidenceMigration).toContain("backtest_evidence_id");
    expect(evidenceMigration).toContain("shadow_evidence_id");
    expect(evidenceMigration).toContain("drop function if exists public.advance_recommendation_v3_calibration");
  });
});
