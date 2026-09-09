import type {
  RecommendationCalibrationCandidateV3,
  RecommendationCalibrationStageV3,
} from "@/lib/analysis/recommendation-learning-v3";
import {
  evaluateCalibrationBacktestEvidenceV3,
  evaluateCalibrationShadowEvidenceV3,
  type CalibrationBacktestEvidenceV3,
  type CalibrationShadowEvidenceV3,
} from "@/lib/analysis/recommendation-calibration-gates-v3";
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
  backtest_evidence_id: string | null;
  shadow_evidence_id: string | null;
  explicit_approval: boolean;
  approved_at: string | null;
  production_at: string | null;
  updated_at: string;
};

export type RecommendationCalibrationEvidenceV3 =
  | CalibrationBacktestEvidenceV3
  | CalibrationShadowEvidenceV3;

export type RecommendationCalibrationEvidenceRowV3 = {
  candidate_id: string;
  evidence_kind: RecommendationCalibrationEvidenceV3["kind"];
  observed_at: string;
  analysis_archetype: string;
  model_version: string;
  recommendation_policy_version: string;
  variant_fingerprint: string;
  dataset_fingerprint: string;
  frozen_dataset: boolean | null;
  unseen_sample: boolean | null;
  user_visible: boolean;
  sample_size: number;
  benchmark_sample_size: number;
  baseline_sample_size: number;
  baseline_benchmark_sample_size: number;
  baseline_hit_rate: number | null;
  variant_hit_rate: number | null;
  baseline_mean_excess_return: number | null;
  variant_mean_excess_return: number | null;
  baseline_integrity_failure_rate: number;
  variant_integrity_failure_rate: number;
  variant_safety_incident_count: number;
  reason_codes: string[];
};

function clean(value: string): string {
  return value.trim();
}

function requireId(value: string, code: string): string {
  const cleaned = clean(value);
  if (!cleaned) throw new Error(code);
  return cleaned;
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
    backtest_evidence_id: null,
    shadow_evidence_id: null,
    explicit_approval: false,
    approved_at: null,
    production_at: null,
    updated_at: updatedAt,
  };
}

/**
 * Converts only gate-passing objective comparison evidence into the private DB
 * contract. The domain gate runs again here so callers cannot persist an
 * arbitrary object and later use its id to promote a calibration candidate.
 */
export function toRecommendationCalibrationEvidenceRowV3(
  persistedCandidateId: string,
  candidate: RecommendationCalibrationCandidateV3,
  evidence: RecommendationCalibrationEvidenceV3,
): RecommendationCalibrationEvidenceRowV3 {
  const gate = evidence.kind === "BACKTEST"
    ? evaluateCalibrationBacktestEvidenceV3(candidate, evidence)
    : evaluateCalibrationShadowEvidenceV3(candidate, evidence);

  if (!gate.passed) {
    throw new Error(`CALIBRATION_EVIDENCE_GATE_FAILED:${gate.reasonCodes.join(",")}`);
  }

  return {
    candidate_id: requireId(persistedCandidateId, "CALIBRATION_PERSISTED_CANDIDATE_ID_REQUIRED"),
    evidence_kind: evidence.kind,
    observed_at: evidence.observedAt,
    analysis_archetype: clean(evidence.analysisArchetype),
    model_version: clean(evidence.modelVersion),
    recommendation_policy_version: clean(evidence.recommendationPolicyVersion),
    variant_fingerprint: clean(evidence.variantFingerprint),
    dataset_fingerprint: clean(evidence.datasetFingerprint),
    frozen_dataset: evidence.kind === "BACKTEST" ? evidence.frozenDataset : null,
    unseen_sample: evidence.kind === "SHADOW" ? evidence.unseenSample : null,
    user_visible: evidence.kind === "SHADOW" ? evidence.userVisible : false,
    sample_size: Math.trunc(evidence.variant.sampleSize),
    benchmark_sample_size: Math.trunc(evidence.variant.benchmarkSampleSize),
    baseline_sample_size: Math.trunc(evidence.baseline.sampleSize),
    baseline_benchmark_sample_size: Math.trunc(evidence.baseline.benchmarkSampleSize),
    baseline_hit_rate: evidence.baseline.hitRate,
    variant_hit_rate: evidence.variant.hitRate,
    baseline_mean_excess_return: evidence.baseline.meanExcessReturn,
    variant_mean_excess_return: evidence.variant.meanExcessReturn,
    baseline_integrity_failure_rate: evidence.baseline.integrityFailureRate,
    variant_integrity_failure_rate: evidence.variant.integrityFailureRate,
    variant_safety_incident_count: evidence.variant.safetyIncidentCount,
    reason_codes: [...gate.reasonCodes],
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

export type RecommendationCalibrationEvidencePersistResultV3 =
  | { ok: true; configured: true; created: boolean; evidenceId: string }
  | { ok: false; configured: false; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; error: string };

async function findExistingEvidenceIdV3(input: {
  supabase: NonNullable<ReturnType<typeof createAdminClient>>;
  candidateId: string;
  evidence: RecommendationCalibrationEvidenceV3;
}): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await input.supabase
    .from("analysis_recommendation_v3_calibration_evidence")
    .select("id")
    .eq("candidate_id", input.candidateId)
    .eq("evidence_kind", input.evidence.kind)
    .eq("variant_fingerprint", clean(input.evidence.variantFingerprint))
    .eq("dataset_fingerprint", clean(input.evidence.datasetFingerprint))
    .maybeSingle();

  if (error) return { id: null, error: error.message };
  const id = data && typeof data.id === "string" ? data.id : null;
  return { id, error: null };
}

/**
 * Persists immutable calibration evidence idempotently. It never upserts:
 * append-only evidence is either inserted once or an identical unique record
 * is reused after a concurrent insert.
 */
export async function persistRecommendationCalibrationEvidenceV3(input: {
  candidate: RecommendationCalibrationCandidateV3;
  evidence: RecommendationCalibrationEvidenceV3;
}): Promise<RecommendationCalibrationEvidencePersistResultV3> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, configured: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const candidateKey = recommendationCalibrationCandidateKeyV3(input.candidate);
    const { data: persistedCandidate, error: candidateError } = await supabase
      .from("analysis_recommendation_v3_calibration_candidates")
      .select("id")
      .eq("candidate_key", candidateKey)
      .maybeSingle();
    if (candidateError) return { ok: false, configured: true, error: candidateError.message };
    const persistedCandidateId = persistedCandidate && typeof persistedCandidate.id === "string"
      ? persistedCandidate.id
      : null;
    if (!persistedCandidateId) {
      return { ok: false, configured: true, error: "CALIBRATION_CANDIDATE_NOT_FOUND" };
    }

    const row = toRecommendationCalibrationEvidenceRowV3(
      persistedCandidateId,
      input.candidate,
      input.evidence,
    );

    const existing = await findExistingEvidenceIdV3({
      supabase,
      candidateId: persistedCandidateId,
      evidence: input.evidence,
    });
    if (existing.error) return { ok: false, configured: true, error: existing.error };
    if (existing.id) return { ok: true, configured: true, created: false, evidenceId: existing.id };

    const { data: inserted, error: insertError } = await supabase
      .from("analysis_recommendation_v3_calibration_evidence")
      .insert(row)
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const raced = await findExistingEvidenceIdV3({
          supabase,
          candidateId: persistedCandidateId,
          evidence: input.evidence,
        });
        if (raced.error) return { ok: false, configured: true, error: raced.error };
        if (raced.id) return { ok: true, configured: true, created: false, evidenceId: raced.id };
      }
      return { ok: false, configured: true, error: insertError.message };
    }

    const evidenceId = inserted && typeof inserted.id === "string" ? inserted.id : null;
    if (!evidenceId) return { ok: false, configured: true, error: "CALIBRATION_EVIDENCE_ID_MISSING" };
    return { ok: true, configured: true, created: true, evidenceId };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_CALIBRATION_EVIDENCE_PERSISTENCE_ERROR",
    };
  }
}

export type RecommendationCalibrationAdvanceEvidenceV3 = {
  backtestEvidenceId?: string | null;
  shadowEvidenceId?: string | null;
  explicitApproval?: boolean;
};

export type RecommendationCalibrationAdvanceResultV3 =
  | { ok: true; configured: true; stage: RecommendationCalibrationStageV3 }
  | { ok: false; configured: false; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; error: string };

const NEXT_CALIBRATION_STAGE_V3: Record<RecommendationCalibrationStageV3, RecommendationCalibrationStageV3 | null> = {
  CANDIDATE: "BACKTESTED",
  BACKTESTED: "SHADOW_VALIDATED",
  SHADOW_VALIDATED: "APPROVED",
  APPROVED: "PRODUCTION",
  PRODUCTION: null,
};

function assertPersistedCalibrationAdvanceInputV3(input: {
  candidate: RecommendationCalibrationCandidateV3;
  nextStage: RecommendationCalibrationStageV3;
  evidence: RecommendationCalibrationAdvanceEvidenceV3;
}): void {
  if (NEXT_CALIBRATION_STAGE_V3[input.candidate.stage] !== input.nextStage) {
    throw new Error("INVALID_CALIBRATION_STAGE_TRANSITION");
  }

  if (input.nextStage === "BACKTESTED" && !clean(input.evidence.backtestEvidenceId ?? "")) {
    throw new Error("CALIBRATION_BACKTEST_EVIDENCE_REQUIRED");
  }
  if (input.nextStage === "SHADOW_VALIDATED" && !clean(input.evidence.shadowEvidenceId ?? "")) {
    throw new Error("CALIBRATION_SHADOW_EVIDENCE_REQUIRED");
  }
  if (input.nextStage === "APPROVED" && input.evidence.explicitApproval !== true) {
    throw new Error("CALIBRATION_EXPLICIT_APPROVAL_REQUIRED");
  }
  if (input.nextStage !== "APPROVED" && input.evidence.explicitApproval === true) {
    throw new Error("CALIBRATION_APPROVAL_STAGE_INVALID");
  }
}

/**
 * Advances only by persisted evidence identifiers. Raw improvement booleans are
 * intentionally absent from this API; the database resolves evidence and
 * repeats lineage/stage checks transactionally.
 */
export async function advancePersistedRecommendationCalibrationV3(input: {
  candidate: RecommendationCalibrationCandidateV3;
  nextStage: RecommendationCalibrationStageV3;
  evidence?: RecommendationCalibrationAdvanceEvidenceV3;
  reason?: string;
  occurredAt?: string;
}): Promise<RecommendationCalibrationAdvanceResultV3> {
  const evidence = input.evidence ?? {};
  assertPersistedCalibrationAdvanceInputV3({
    candidate: input.candidate,
    nextStage: input.nextStage,
    evidence,
  });

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, configured: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("advance_recommendation_v3_calibration", {
      p_candidate_key: recommendationCalibrationCandidateKeyV3(input.candidate),
      p_expected_stage: input.candidate.stage,
      p_next_stage: input.nextStage,
      p_backtest_evidence_id: clean(evidence.backtestEvidenceId ?? "") || null,
      p_shadow_evidence_id: clean(evidence.shadowEvidenceId ?? "") || null,
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
