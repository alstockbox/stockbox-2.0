import type { RecommendationV3ShadowEvent } from "@/lib/analysis/recommendation-v3-shadow";
import { createAdminClient } from "@/lib/supabase/admin";

export type RecommendationV3AuditRow = {
  observed_at: string;
  ticker: string;
  analysis_fingerprint: string | null;
  analysis_archetype: string;
  model_version: string;
  legacy_rating: string;
  normalized_legacy_rating: string;
  v3_rating: string;
  changed: boolean;
  objective_score: number | null;
  conviction: number;
  data_quality: number;
  model_uncertainty: number;
  had_personalized_score: boolean;
  confidence_gate_passed: boolean;
  confidence_gate_hard_blocked: boolean;
  reason_codes: string[];
  coverage_policy_version: string;
  anomaly_policy_version: string;
  recommendation_policy_version: string;
  coverage_profile: string;
  verified_coverage: number;
  retrieval_coverage: number;
  conflict_count: number;
  stockbox_failure_count: number;
  source_unavailable_count: number;
  recommendation_eligible: boolean;
  data_integrity_score: number;
  blocking_anomaly_count: number;
  anomaly_codes: string[];
  recommendation_integrity_eligible: boolean;
  updated_at: string;
};

/**
 * Explicit allowlist mapper for the private V3 audit store.
 * Do not spread the shadow event here: adding a future event field must never
 * silently expand what is persisted. In particular, no user id, raw financial
 * payload or personalized-score value belongs in this row.
 */
export function toRecommendationV3AuditRow(
  event: RecommendationV3ShadowEvent,
  updatedAt = event.observedAt,
): RecommendationV3AuditRow {
  return {
    observed_at: event.observedAt,
    ticker: event.ticker,
    analysis_fingerprint: event.analysisFingerprint,
    analysis_archetype: event.analysisArchetype,
    model_version: event.modelVersion,
    legacy_rating: event.legacyRating,
    normalized_legacy_rating: event.normalizedLegacyRating,
    v3_rating: event.v3Rating,
    changed: event.changed,
    objective_score: event.objectiveScore,
    conviction: event.conviction,
    data_quality: event.dataQuality,
    model_uncertainty: event.modelUncertainty,
    had_personalized_score: event.hadPersonalizedScore,
    confidence_gate_passed: event.confidenceGatePassed,
    confidence_gate_hard_blocked: event.confidenceGateHardBlocked,
    reason_codes: [...event.reasonCodes],
    coverage_policy_version: event.coveragePolicyVersion,
    anomaly_policy_version: event.anomalyPolicyVersion,
    recommendation_policy_version: event.recommendationPolicyVersion,
    coverage_profile: event.coverageProfile,
    verified_coverage: event.verifiedCoverage,
    retrieval_coverage: event.retrievalCoverage,
    conflict_count: event.conflictCount,
    stockbox_failure_count: event.stockboxFailureCount,
    source_unavailable_count: event.sourceUnavailableCount,
    recommendation_eligible: event.recommendationEligible,
    data_integrity_score: event.dataIntegrityScore,
    blocking_anomaly_count: event.blockingAnomalyCount,
    anomaly_codes: [...event.anomalyCodes],
    recommendation_integrity_eligible: event.recommendationIntegrityEligible,
    updated_at: updatedAt,
  };
}

export type RecommendationV3AuditPersistResult =
  | { ok: true; configured: true }
  | { ok: false; configured: false; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; error: string };

/**
 * Server-side, service-role-only persistence. The caller decides request-lifecycle
 * semantics; this helper never throws so audit availability cannot break an
 * analysis response.
 */
export async function persistRecommendationV3ShadowAudit(
  event: RecommendationV3ShadowEvent,
): Promise<RecommendationV3AuditPersistResult> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, configured: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };
  }

  try {
    const row = toRecommendationV3AuditRow(event, new Date().toISOString());
    const { error } = await supabase
      .from("analysis_recommendation_v3_audit")
      .upsert(row, {
        onConflict: "ticker,analysis_fingerprint,model_version,recommendation_policy_version",
        ignoreDuplicates: false,
      });

    if (error) return { ok: false, configured: true, error: error.message };
    return { ok: true, configured: true };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "UNKNOWN_AUDIT_PERSISTENCE_ERROR",
    };
  }
}
