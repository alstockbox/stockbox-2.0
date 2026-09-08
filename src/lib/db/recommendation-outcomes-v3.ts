import type { RecommendationOutcomeHorizonV3 } from "@/lib/analysis/recommendation-learning-v3";
import { createAdminClient } from "@/lib/supabase/admin";

export type RecommendationOutcomePersistInputV3 = {
  recommendationAuditId: string;
  policyVersion: string;
  horizon: RecommendationOutcomeHorizonV3;
  expectedAt: string;
  evaluatedAt: string;
  lagDays: number;
  entryPrice: number;
  observedPrice: number;
  securityCurrency: string | null;
  securityReturn: number;
  benchmarkTicker: string | null;
  benchmarkEntryPrice: number | null;
  benchmarkObservedPrice: number | null;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  directionalHit: boolean | null;
  securityPriceSource: string;
  benchmarkPriceSource: string | null;
};

export type RecommendationOutcomeRowV3 = {
  recommendation_audit_id: string;
  policy_version: string;
  horizon: RecommendationOutcomeHorizonV3;
  expected_at: string;
  evaluated_at: string;
  lag_days: number;
  entry_price: number;
  observed_price: number;
  security_currency: string | null;
  security_return: number;
  benchmark_ticker: string | null;
  benchmark_entry_price: number | null;
  benchmark_observed_price: number | null;
  benchmark_return: number | null;
  excess_return: number | null;
  directional_hit: boolean | null;
  security_price_source: string;
  benchmark_price_source: string | null;
  updated_at: string;
};

function normalizeTicker(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

/**
 * Explicit allowlist mapper for objective recommendation outcomes.
 * No user identity, personalized score, portfolio state, provider payload or AI
 * output is accepted by this persistence contract.
 */
export function toRecommendationOutcomeV3Row(
  input: RecommendationOutcomePersistInputV3,
  updatedAt = input.evaluatedAt,
): RecommendationOutcomeRowV3 {
  return {
    recommendation_audit_id: input.recommendationAuditId.trim(),
    policy_version: input.policyVersion,
    horizon: input.horizon,
    expected_at: input.expectedAt,
    evaluated_at: input.evaluatedAt,
    lag_days: Math.max(0, Math.trunc(input.lagDays)),
    entry_price: input.entryPrice,
    observed_price: input.observedPrice,
    security_currency: normalizeTicker(input.securityCurrency),
    security_return: input.securityReturn,
    benchmark_ticker: normalizeTicker(input.benchmarkTicker),
    benchmark_entry_price: input.benchmarkEntryPrice,
    benchmark_observed_price: input.benchmarkObservedPrice,
    benchmark_return: input.benchmarkReturn,
    excess_return: input.excessReturn,
    directional_hit: input.directionalHit,
    security_price_source: input.securityPriceSource.trim(),
    benchmark_price_source: input.benchmarkPriceSource?.trim() || null,
    updated_at: updatedAt,
  };
}

export type RecommendationOutcomePersistResultV3 =
  | { ok: true; configured: true }
  | { ok: false; configured: false; error: "SUPABASE_ADMIN_NOT_CONFIGURED" }
  | { ok: false; configured: true; error: string };

/**
 * Service-role-only and idempotent on (recommendation_audit_id, horizon).
 * This helper never throws so an evaluation-store outage cannot affect analysis.
 */
export async function persistRecommendationOutcomeV3(
  input: RecommendationOutcomePersistInputV3,
): Promise<RecommendationOutcomePersistResultV3> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, configured: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };
  }

  try {
    const row = toRecommendationOutcomeV3Row(input, new Date().toISOString());
    const { error } = await supabase
      .from("analysis_recommendation_v3_outcomes")
      .upsert(row, {
        onConflict: "recommendation_audit_id,horizon",
        ignoreDuplicates: false,
      });

    if (error) return { ok: false, configured: true, error: error.message };
    return { ok: true, configured: true };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "UNKNOWN_RECOMMENDATION_OUTCOME_PERSISTENCE_ERROR",
    };
  }
}
