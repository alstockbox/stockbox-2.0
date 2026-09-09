import {
  RECOMMENDATION_OUTCOME_POLICY_VERSION,
  type RecommendationOutcomeHorizonV3,
} from "@/lib/analysis/recommendation-learning-v3";
import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import { createAdminClient } from "@/lib/supabase/admin";

const DAY_MS = 86_400_000;
const RETURN_RELATIVE_TOLERANCE = 1e-9;

export type RecommendationOutcomePersistInputV3 = {
  recommendationAuditId: string;
  policyVersion: string;
  horizon: RecommendationOutcomeHorizonV3;
  expectedAt: string;
  evaluatedAt: string;
  lagDays: number;
  entryObservedAt: string;
  entryPrice: number;
  observedPrice: number;
  securityCurrency: string | null;
  securityReturn: number;
  benchmarkTicker: string | null;
  benchmarkEntryObservedAt: string | null;
  benchmarkEntryPrice: number | null;
  benchmarkObservedAt: string | null;
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
  benchmark_policy_version: string;
  horizon: RecommendationOutcomeHorizonV3;
  expected_at: string;
  evaluated_at: string;
  lag_days: number;
  entry_observed_at: string;
  entry_price: number;
  observed_price: number;
  security_currency: string | null;
  security_return: number;
  benchmark_ticker: string | null;
  benchmark_entry_observed_at: string | null;
  benchmark_entry_price: number | null;
  benchmark_observed_at: string | null;
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

function normalizedText(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function returnFromPrices(entryPrice: number, observedPrice: number): number {
  return observedPrice / entryPrice - 1;
}

function returnMatches(stored: number, computed: number): boolean {
  if (!Number.isFinite(stored) || !Number.isFinite(computed)) return false;
  const scale = Math.max(1, Math.abs(stored), Math.abs(computed));
  return Math.abs(stored - computed) <= RETURN_RELATIVE_TOLERANCE * scale;
}

function lagDaysFromTimeline(expectedAt: string, evaluatedAt: string): number | null {
  const expectedMs = Date.parse(expectedAt);
  const evaluatedMs = Date.parse(evaluatedAt);
  if (!Number.isFinite(expectedMs) || !Number.isFinite(evaluatedMs) || evaluatedMs < expectedMs) return null;
  return Math.max(0, Math.round((evaluatedMs - expectedMs) / DAY_MS));
}

function hasAnyBenchmarkEvidence(input: RecommendationOutcomePersistInputV3): boolean {
  return [
    input.benchmarkTicker,
    input.benchmarkEntryObservedAt,
    input.benchmarkEntryPrice,
    input.benchmarkObservedAt,
    input.benchmarkObservedPrice,
    input.benchmarkReturn,
    input.excessReturn,
    input.directionalHit,
    input.benchmarkPriceSource,
  ].some((value) => value !== null);
}

/**
 * Explicit allowlist mapper for objective recommendation outcomes.
 * No user identity, personalized score, portfolio state, provider payload or AI
 * output is accepted by this persistence contract. Outcome and benchmark policy
 * lineage are bound to canonical server constants rather than caller authority.
 *
 * Evidence is validated rather than repaired: timeline/lag, returns and benchmark
 * evidence must reproduce from the persisted inputs or the write is rejected.
 */
export function toRecommendationOutcomeV3Row(
  input: RecommendationOutcomePersistInputV3,
  updatedAt = input.evaluatedAt,
): RecommendationOutcomeRowV3 {
  if (input.policyVersion !== RECOMMENDATION_OUTCOME_POLICY_VERSION) {
    throw new Error("INVALID_RECOMMENDATION_OUTCOME_POLICY_VERSION");
  }

  if (!Number.isFinite(input.lagDays) || !Number.isInteger(input.lagDays) || input.lagDays < 0) {
    throw new Error("INVALID_RECOMMENDATION_OUTCOME_LAG_DAYS");
  }

  const canonicalLagDays = lagDaysFromTimeline(input.expectedAt, input.evaluatedAt);
  if (canonicalLagDays === null) {
    throw new Error("INVALID_RECOMMENDATION_OUTCOME_TIMELINE");
  }
  if (canonicalLagDays !== input.lagDays) {
    throw new Error("INVALID_RECOMMENDATION_OUTCOME_LAG_EVIDENCE");
  }

  if (!finitePositive(input.entryPrice) || !finitePositive(input.observedPrice)) {
    throw new Error("INVALID_RECOMMENDATION_OUTCOME_SECURITY_PRICES");
  }
  if (!returnMatches(input.securityReturn, returnFromPrices(input.entryPrice, input.observedPrice))) {
    throw new Error("INVALID_RECOMMENDATION_OUTCOME_SECURITY_RETURN");
  }

  const securityPriceSource = normalizedText(input.securityPriceSource);
  if (securityPriceSource === null) {
    throw new Error("INVALID_RECOMMENDATION_OUTCOME_SECURITY_PRICE_SOURCE");
  }

  const benchmarkEvidencePresent = hasAnyBenchmarkEvidence(input);
  let benchmarkTicker: string | null = null;
  let benchmarkEntryObservedAt: string | null = null;
  let benchmarkEntryPrice: number | null = null;
  let benchmarkObservedAt: string | null = null;
  let benchmarkObservedPrice: number | null = null;
  let benchmarkReturn: number | null = null;
  let excessReturn: number | null = null;
  let benchmarkPriceSource: string | null = null;

  if (benchmarkEvidencePresent) {
    benchmarkTicker = normalizeTicker(input.benchmarkTicker);
    benchmarkEntryObservedAt = normalizedText(input.benchmarkEntryObservedAt);
    benchmarkObservedAt = normalizedText(input.benchmarkObservedAt);
    benchmarkPriceSource = normalizedText(input.benchmarkPriceSource);

    const benchmarkEntryPriceInput = input.benchmarkEntryPrice;
    const benchmarkObservedPriceInput = input.benchmarkObservedPrice;
    const benchmarkReturnInput = input.benchmarkReturn;
    const excessReturnInput = input.excessReturn;

    if (
      benchmarkTicker === null
      || benchmarkEntryObservedAt === null
      || benchmarkEntryPriceInput === null
      || !finitePositive(benchmarkEntryPriceInput)
      || benchmarkObservedAt === null
      || benchmarkObservedPriceInput === null
      || !finitePositive(benchmarkObservedPriceInput)
      || benchmarkReturnInput === null
      || !Number.isFinite(benchmarkReturnInput)
      || excessReturnInput === null
      || !Number.isFinite(excessReturnInput)
      || benchmarkPriceSource === null
    ) {
      throw new Error("INVALID_RECOMMENDATION_OUTCOME_BENCHMARK_EVIDENCE");
    }

    benchmarkEntryPrice = benchmarkEntryPriceInput;
    benchmarkObservedPrice = benchmarkObservedPriceInput;
    benchmarkReturn = benchmarkReturnInput;
    excessReturn = excessReturnInput;

    if (!returnMatches(benchmarkReturnInput, returnFromPrices(benchmarkEntryPriceInput, benchmarkObservedPriceInput))) {
      throw new Error("INVALID_RECOMMENDATION_OUTCOME_BENCHMARK_RETURN");
    }
    if (!returnMatches(excessReturnInput, input.securityReturn - benchmarkReturnInput)) {
      throw new Error("INVALID_RECOMMENDATION_OUTCOME_EXCESS_RETURN");
    }
  } else if (input.directionalHit !== null) {
    throw new Error("INVALID_RECOMMENDATION_OUTCOME_BENCHMARK_EVIDENCE");
  }

  return {
    recommendation_audit_id: input.recommendationAuditId.trim(),
    policy_version: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    benchmark_policy_version: RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3,
    horizon: input.horizon,
    expected_at: input.expectedAt,
    evaluated_at: input.evaluatedAt,
    lag_days: input.lagDays,
    entry_observed_at: input.entryObservedAt,
    entry_price: input.entryPrice,
    observed_price: input.observedPrice,
    security_currency: normalizeTicker(input.securityCurrency),
    security_return: input.securityReturn,
    benchmark_ticker: benchmarkTicker,
    benchmark_entry_observed_at: benchmarkEntryObservedAt,
    benchmark_entry_price: benchmarkEntryPrice,
    benchmark_observed_at: benchmarkObservedAt,
    benchmark_observed_price: benchmarkObservedPrice,
    benchmark_return: benchmarkReturn,
    excess_return: excessReturn,
    directional_hit: benchmarkEvidencePresent ? input.directionalHit : null,
    security_price_source: securityPriceSource,
    benchmark_price_source: benchmarkPriceSource,
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
