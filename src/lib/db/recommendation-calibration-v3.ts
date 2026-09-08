import {
  advanceRecommendationCalibrationV3,
  type CalibrationPromotionEvidenceV3,
  type RecommendationCalibrationCandidateV3,
  type RecommendationCalibrationStageV3,
} from "@/lib/analysis/recommendation-learning-v3";
import { createAdminClient } from "@/lib/supabase/admin";

export type RecommendationCalibrationCandidateRowV3 = {
  candidate_key: string;
  candidate_id: string;
  policy_version: string;
  created_at: string;
  stage: RecommendationCalibrationStageV3;
  horizon: RecommendationCalibrationCandidateV3["horizon"];
  rating: RecommendationCalibrationCandidateV3["rating"];
  analysis_archetype: string;
  model_version: string;
  recommendation_policy_version: string;
  sample_size: number;
  benchmark_sample_size: number;
  hit_rate: number | null;
  mean_excess_return: number | null;
  reasons: string[];
  backtest_improved: boolean | null;
  shadow_improved: boolean | null;
  explicit_approval: boolean;
  approved_at: string | null;
  production_at: string | null;
  updated_at: string;
};

function clean(value: string): string {
  return value.trim();
}

/**
 * Stable identity for one calibration problem. A production parameter/model
 * change must bump model or recommendation policy version before a fresh
 * calibration lineage can be created.
 */
export function recommendationCalibrationCandidateKeyV3(
  candidate: Pick<RecommendationCalibrationCandidateV3,
    | "policyVersion"
    | "analysisArchetype"
    | "modelVersion"
    | "recommendationPolicyVersion"
    | "horizon"
    | "rating">,
): string {
  return JSON.stringify([
    clean(candidate.policyVersion),
    clean(candidate.analysisArchetype),
    clean(candidate.modelVersion),
    clean(candidate.recommendationPolicyVersion),
    candidate.horizon,
    candidate.rating,
  ]);
}

/**
 * Explicit allowlist mapper. Calibration storage accepts only objective model
 * lineage, aggregate performance and promotion evidence. No user identity,
 * portfolio state, personalized score or generative AI payload is accepted.
 */
export function toRecommendationCalibrationCandidateRowV3(
  candidate: RecommendationCalibrationCandidateV3,
  updatedAt = candidate.createdAt,
): RecommendationCalibrationCandidateRowV3 {
  return {
    candidate_key: recommendationCalibrationCandidateKeyV3(candidate),
    candidate_id: clean(candidate.candidateId),
    policy_version: clean(candidate.policyVersion),
    created_at: candidate.createdAt,
    stage: candidate.stage,
    horizon: candidate.horizon,
    rating: candidate.rating,
    analysis_archetype: clean(candidate.analysisArchetype),
    model_version: clean(candidate.modelVersion),
    recommendation_policy_version: clean(candidate.recommendationPolicyVersion),
    sample_size: Math.max(0, Math.trunc(candidate.sampleSize)),
    benchmark_sample_size: Math.max(0, Math.min(Math.trunc(candidate.benchmarkSampleSize), Math.trunc(candidate.sampleSize))),
    hit_rate: candidate.hitRate,
    mean_excess_return: candidate.meanExcessReturn,
    reasons: [...candidate.reasons],
    backtest_improved: null,
    shadow_improved: null,
    explicit_approval: false,
    approved_at: null,
    production_at: null,
    updated_at: updatedAt,
  };
}

export type RecommendationCalibrationPersistResultV3 =
  | { ok: true; configured: true; created: boolean; refreshed: boolean; stage: RecommendationCalibrationStageV3 }
  | { ok: false; configured: false; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; error: string };

export async function persistRecommendationCalibrationCandidateV3(
  candidate: RecommendationCalibrationCandidateV3,
): Promise<RecommendationCalibrationPersistResultV3> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, configured: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  const row = toRecommendationCalibrationCandidateRowV3(candidate, new Date().toISOString());
  try {
    const { data: existing, error: readError } = await supabase
      .from("analysis_recommendation_v3_calibration_candidates")
      .select("stage")
      .eq("candidate_key", row.candidate_key)
      .maybeSingle();
    if (readError) return { ok: false, configured: true, error: readError.message };

    const currentStage = existing?.stage as RecommendationCalibrationStageV3 | undefined;
    if (currentStage) {
      if (currentStage !== "CANDIDATE") {
        return { ok: true, configured: true, created: false, refreshed: false, stage: currentStage };
      }

      const { error: updateError } = await supabase
        .from("analysis_recommendation_v3_calibration_candidates")
        .update({
          sample_size: row.sample_size,
          benchmark_sample_size: row.benchmark_sample_size,
          hit_rate: row.hit_rate,
          mean_excess_return: row.mean_excess_return,
          reasons: row.reasons,
          updated_at: row.updated_at,
        })
        .eq("candidate_key", row.candidate_key)
        .eq("stage", "CANDIDATE");
      if (updateError) return { ok: false, configured: true, error: updateError.message };
      return { ok: true, configured: true, created: false, refreshed: true, stage: "CANDIDATE" };
    }

    const { error: insertError } = await supabase
      .from("analysis_recommendation_v3_calibration_candidates")
      .insert(row);
    if (insertError) {
      if (insertError.code === "23505") {
        return { ok: true, configured: true, created: false, refreshed: false, stage: "CANDIDATE" };
      }
      return { ok: false, configured: true, error: insertError.message };
    }
    return { ok: true, configured: true, created: true, refreshed: false, stage: "CANDIDATE" };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_CALIBRATION_PERSISTENCE_ERROR",
    };
  }
}

export type RecommendationCalibrationAdvanceResultV3 =
  | { ok: true; configured: true; stage: RecommendationCalibrationStageV3 }
  | { ok: false; configured: false; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; error: string };

export async function advancePersistedRecommendationCalibrationV3(input: {
  candidate: RecommendationCalibrationCandidateV3;
  nextStage: RecommendationCalibrationStageV3;
  evidence?: CalibrationPromotionEvidenceV3;
  reason?: string;
  occurredAt?: string;
}): Promise<RecommendationCalibrationAdvanceResultV3> {
  const evidence = input.evidence ?? {};

  // Apply the exact same domain guard before touching persistence. The RPC then
  // repeats these invariants transactionally and protects against stale stages.
  advanceRecommendationCalibrationV3(input.candidate, input.nextStage, evidence);

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, configured: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("advance_recommendation_v3_calibration", {
      p_candidate_key: recommendationCalibrationCandidateKeyV3(input.candidate),
      p_expected_stage: input.candidate.stage,
      p_next_stage: input.nextStage,
      p_backtest_improved: evidence.backtestImproved ?? null,
      p_shadow_improved: evidence.shadowImproved ?? null,
      p_explicit_approval: evidence.explicitApproval === true,
      p_reason: input.reason?.trim() || null,
      p_occurred_at: input.occurredAt ?? new Date().toISOString(),
    });
    if (error) return { ok: false, configured: true, error: error.message };

    const returned = Array.isArray(data) ? data[0] : data;
    const stage = returned && typeof returned === "object" && "stage" in returned
      ? (returned.stage as RecommendationCalibrationStageV3)
      : input.nextStage;
    return { ok: true, configured: true, stage };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_CALIBRATION_ADVANCE_ERROR",
    };
  }
}
