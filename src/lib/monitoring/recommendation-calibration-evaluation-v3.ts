import {
  RECOMMENDATION_OUTCOME_POLICY_VERSION,
  evaluateRecommendationPerformanceV3,
  proposeRecommendationCalibrationV3,
  type RecommendationOutcomeHorizonV3,
  type RecommendationOutcomeV3,
} from "@/lib/analysis/recommendation-learning-v3";
import { RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3 } from "@/lib/analysis/recommendation-outcome-benchmark-policy-v3";
import { evaluateRecommendationPerformanceRollupsV3 } from "@/lib/analysis/recommendation-performance-rollup-v3";
import type { RecommendationV3Rating } from "@/lib/analysis/recommendation-v3";
import { persistRecommendationCalibrationCandidateV3 } from "@/lib/db/recommendation-calibration-v3";
import { persistRecommendationPerformanceRollupsV3 } from "@/lib/db/recommendation-performance-rollups-v3";
import { createAdminClient } from "@/lib/supabase/admin";
import { recommendationOutcomeTrackingGateV3 } from "./recommendation-outcome-jobs-v3";

const OUTCOME_HORIZONS = new Set<RecommendationOutcomeHorizonV3>(["1d", "7d", "30d", "90d", "180d", "1y"]);
const RATINGS = new Set<RecommendationV3Rating>([
  "STRONG_BUY",
  "BUY",
  "WAIT",
  "HOLD",
  "REDUCE",
  "SELL",
  "UNAVAILABLE",
]);
const DAY_MS = 86_400_000;
const RETURN_RELATIVE_TOLERANCE = 1e-9;

const OUTCOME_PROJECTION = [
  "recommendation_audit_id",
  "policy_version",
  "benchmark_policy_version",
  "horizon",
  "expected_at",
  "evaluated_at",
  "lag_days",
  "entry_price",
  "observed_price",
  "security_return",
  "benchmark_ticker",
  "benchmark_entry_price",
  "benchmark_observed_price",
  "benchmark_return",
  "excess_return",
  "directional_hit",
].join(",");

const AUDIT_PROJECTION = [
  "id",
  "ticker",
  "analysis_archetype",
  "sector",
  "model_version",
  "recommendation_policy_version",
  "v3_rating",
  "conviction",
  "data_quality",
].join(",");

type AuditLineageRowV3 = {
  id: string;
  ticker: string;
  analysisArchetype: string;
  sector?: string | null;
  modelVersion: string;
  recommendationPolicyVersion: string;
  rating: RecommendationV3Rating;
  conviction: number;
  dataQuality: number;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function boundedScore(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function persistenceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizedDimension(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizedRequiredText(value: unknown): string | null {
  return normalizedDimension(value);
}

function returnFromPrices(entryPrice: number, observedPrice: number): number {
  return observedPrice / entryPrice - 1;
}

function returnMatches(stored: number, computed: number): boolean {
  const scale = Math.max(1, Math.abs(stored), Math.abs(computed));
  return Math.abs(stored - computed) <= RETURN_RELATIVE_TOLERANCE * scale;
}

function directionForRating(rating: RecommendationV3Rating): -1 | 0 | 1 {
  if (rating === "STRONG_BUY" || rating === "BUY") return 1;
  if (rating === "REDUCE" || rating === "SELL") return -1;
  return 0;
}

function auditLineageRow(value: unknown): AuditLineageRowV3 | null {
  const row = persistenceRecord(value);
  if (!row) return null;
  const id = normalizedRequiredText(row.id);
  const ticker = normalizedRequiredText(row.ticker);
  const analysisArchetype = normalizedRequiredText(row.analysis_archetype);
  const modelVersion = normalizedRequiredText(row.model_version);
  const recommendationPolicyVersion = normalizedRequiredText(row.recommendation_policy_version);
  if (id === null || ticker === null || analysisArchetype === null || modelVersion === null || recommendationPolicyVersion === null) return null;
  if (typeof row.v3_rating !== "string" || !RATINGS.has(row.v3_rating as RecommendationV3Rating)) return null;
  const conviction = boundedScore(row.conviction);
  const dataQuality = boundedScore(row.data_quality);
  if (conviction === null || dataQuality === null) return null;

  return {
    id,
    ticker: ticker.toUpperCase(),
    analysisArchetype,
    sector: normalizedDimension(row.sector),
    modelVersion,
    recommendationPolicyVersion,
    rating: row.v3_rating as RecommendationV3Rating,
    conviction,
    dataQuality,
  };
}

function validAuditLineageForOutcomeV3(lineage: AuditLineageRowV3): AuditLineageRowV3 | null {
  const id = normalizedRequiredText(lineage.id);
  const ticker = normalizedRequiredText(lineage.ticker);
  const analysisArchetype = normalizedRequiredText(lineage.analysisArchetype);
  const modelVersion = normalizedRequiredText(lineage.modelVersion);
  const recommendationPolicyVersion = normalizedRequiredText(lineage.recommendationPolicyVersion);
  if (id === null || ticker === null || analysisArchetype === null || modelVersion === null || recommendationPolicyVersion === null) return null;
  if (!RATINGS.has(lineage.rating)) return null;
  const conviction = boundedScore(lineage.conviction);
  const dataQuality = boundedScore(lineage.dataQuality);
  if (conviction === null || dataQuality === null) return null;
  return {
    ...lineage,
    id,
    ticker: ticker.toUpperCase(),
    analysisArchetype,
    sector: normalizedDimension(lineage.sector),
    modelVersion,
    recommendationPolicyVersion,
    conviction,
    dataQuality,
  };
}

function benchmarkEvidencePresent(row: Record<string, unknown>): boolean {
  return [
    row.benchmark_ticker,
    row.benchmark_entry_price,
    row.benchmark_observed_price,
    row.benchmark_return,
    row.excess_return,
    row.directional_hit,
  ].some((value) => value !== null && value !== undefined);
}

export function recommendationOutcomeFromPersistenceV3(
  value: unknown,
  lineage: AuditLineageRowV3,
): RecommendationOutcomeV3 | null {
  const row = persistenceRecord(value);
  if (!row) return null;
  const validatedLineage = validAuditLineageForOutcomeV3(lineage);
  if (!validatedLineage) return null;
  if (row.policy_version !== RECOMMENDATION_OUTCOME_POLICY_VERSION) return null;
  if (typeof row.horizon !== "string" || !OUTCOME_HORIZONS.has(row.horizon as RecommendationOutcomeHorizonV3)) return null;
  if (!validDate(row.expected_at) || !validDate(row.evaluated_at)) return null;

  const expectedAtMs = Date.parse(row.expected_at);
  const evaluatedAtMs = Date.parse(row.evaluated_at);
  if (evaluatedAtMs < expectedAtMs) return null;
  const lagDays = finiteNumber(row.lag_days);
  const canonicalLagDays = Math.max(0, Math.round((evaluatedAtMs - expectedAtMs) / DAY_MS));
  if (lagDays === null || !Number.isInteger(lagDays) || lagDays < 0 || lagDays !== canonicalLagDays) return null;

  const entryPrice = finiteNumber(row.entry_price);
  const observedPrice = finiteNumber(row.observed_price);
  const securityReturn = finiteNumber(row.security_return);
  if (entryPrice === null || entryPrice <= 0 || observedPrice === null || observedPrice <= 0 || securityReturn === null) return null;
  if (!returnMatches(securityReturn, returnFromPrices(entryPrice, observedPrice))) return null;

  // Benchmark-relative evidence is accepted only when the row proves which
  // current assignment policy produced it. Legacy/stale benchmark evidence is
  // not deleted and the absolute security outcome remains usable, but all
  // relative fields are downgraded to missing so calibration cannot mix policy
  // generations or infer a benchmark that StockBox cannot reproduce.
  const benchmarkLineageCurrent = row.benchmark_policy_version === RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3;
  let benchmarkTicker: string | null = null;
  let benchmarkEntryPrice: number | null = null;
  let benchmarkObservedPrice: number | null = null;
  let benchmarkReturn: number | null = null;
  let excessReturn: number | null = null;
  let directionalHit: boolean | null = null;

  if (benchmarkLineageCurrent && benchmarkEvidencePresent(row)) {
    benchmarkTicker = normalizedRequiredText(row.benchmark_ticker)?.toUpperCase() ?? null;
    benchmarkEntryPrice = finiteNumber(row.benchmark_entry_price);
    benchmarkObservedPrice = finiteNumber(row.benchmark_observed_price);
    benchmarkReturn = finiteNumber(row.benchmark_return);
    excessReturn = finiteNumber(row.excess_return);
    if (benchmarkTicker === null
        || benchmarkEntryPrice === null || benchmarkEntryPrice <= 0
        || benchmarkObservedPrice === null || benchmarkObservedPrice <= 0
        || benchmarkReturn === null || excessReturn === null) return null;
    if (!returnMatches(benchmarkReturn, returnFromPrices(benchmarkEntryPrice, benchmarkObservedPrice))) return null;
    if (!returnMatches(excessReturn, securityReturn - benchmarkReturn)) return null;

    const direction = directionForRating(validatedLineage.rating);
    if (direction === 0) {
      if (row.directional_hit !== null && row.directional_hit !== undefined) return null;
    } else {
      if (typeof row.directional_hit !== "boolean") return null;
      const expectedDirectionalHit = direction * excessReturn > 0;
      if (row.directional_hit !== expectedDirectionalHit) return null;
      directionalHit = row.directional_hit;
    }
  }

  return {
    policyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    snapshotId: validatedLineage.id,
    ticker: validatedLineage.ticker,
    rating: validatedLineage.rating,
    analysisArchetype: validatedLineage.analysisArchetype,
    sector: validatedLineage.sector ?? null,
    modelVersion: validatedLineage.modelVersion,
    recommendationPolicyVersion: validatedLineage.recommendationPolicyVersion,
    horizon: row.horizon as RecommendationOutcomeHorizonV3,
    expectedAt: row.expected_at,
    evaluatedAt: row.evaluated_at,
    lagDays,
    entryPrice,
    observedPrice,
    securityReturn,
    benchmarkTicker,
    benchmarkEntryPrice,
    benchmarkObservedPrice,
    benchmarkReturn,
    excessReturn,
    directionalHit,
    conviction: validatedLineage.conviction,
    dataQuality: validatedLineage.dataQuality,
  };
}

async function loadAuditLineageV3(ids: string[]): Promise<Map<string, AuditLineageRowV3>> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const map = new Map<string, AuditLineageRowV3>();
  const unique = [...new Set(ids.filter(Boolean))];

  for (let offset = 0; offset < unique.length; offset += 500) {
    const chunk = unique.slice(offset, offset + 500);
    const { data, error } = await admin
      .from("analysis_recommendation_v3_audit")
      .select(AUDIT_PROJECTION)
      .in("id", chunk);
    if (error) throw new Error(`Unable to load recommendation lineage for calibration: ${error.message}`);
    for (const value of data ?? []) {
      const parsed = auditLineageRow(value);
      if (parsed) map.set(parsed.id, parsed);
    }
  }
  return map;
}

export async function loadRecommendationOutcomesForCalibrationV3(options: {
  limit?: number;
} = {}): Promise<RecommendationOutcomeV3[]> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const limit = Math.max(30, Math.min(Math.trunc(options.limit ?? 5_000), 20_000));

  const { data, error } = await admin
    .from("analysis_recommendation_v3_outcomes")
    .select(OUTCOME_PROJECTION)
    .eq("policy_version", RECOMMENDATION_OUTCOME_POLICY_VERSION)
    .order("evaluated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Unable to load recommendation outcomes for calibration: ${error.message}`);

  // The migration can be ahead of generated Supabase table typings on a feature branch.
  // Treat persistence rows as unknown at this boundary and validate every field before use.
  const rows: unknown[] = data ?? [];
  const auditIds = rows.flatMap((value) => {
    const row = persistenceRecord(value);
    return row && typeof row.recommendation_audit_id === "string"
      ? [row.recommendation_audit_id]
      : [];
  });
  if (auditIds.length === 0) return [];
  const lineage = await loadAuditLineageV3(auditIds);

  return rows.flatMap((value) => {
    const row = persistenceRecord(value);
    if (!row) return [];
    const id = typeof row.recommendation_audit_id === "string" ? row.recommendation_audit_id : "";
    const audit = lineage.get(id);
    if (!audit) return [];
    const parsed = recommendationOutcomeFromPersistenceV3(row, audit);
    return parsed ? [parsed] : [];
  });
}

export type RecommendationCalibrationEvaluationResultV3 = {
  pausedReason?: "recommendation_v3_disabled" | "recommendation_engine_killed" | "background_jobs_killed";
  outcomes: number;
  performanceSlices: number;
  performanceRollups: number;
  performanceRollupsPersisted: number;
  performanceRollupPersistenceFailed: number;
  basePerformanceRollups: number;
  dimensionPerformanceRollups: number;
  driftSlices: number;
  created: number;
  refreshed: number;
  deduplicated: number;
  failed: number;
};

export async function runRecommendationCalibrationEvaluationV3(options: {
  limit?: number;
  minimumBenchmarkSample?: number;
  now?: Date;
} = {}): Promise<RecommendationCalibrationEvaluationResultV3> {
  const gate = recommendationOutcomeTrackingGateV3();
  if (!gate.allowed) {
    return {
      pausedReason: gate.reason,
      outcomes: 0,
      performanceSlices: 0,
      performanceRollups: 0,
      performanceRollupsPersisted: 0,
      performanceRollupPersistenceFailed: 0,
      basePerformanceRollups: 0,
      dimensionPerformanceRollups: 0,
      driftSlices: 0,
      created: 0,
      refreshed: 0,
      deduplicated: 0,
      failed: 0,
    };
  }

  const sourceLimit = Math.max(30, Math.min(Math.trunc(options.limit ?? 5_000), 20_000));
  const dimensionSampleGate = Math.max(20, Math.trunc(options.minimumBenchmarkSample ?? 30));
  const outcomes = await loadRecommendationOutcomesForCalibrationV3({ limit: sourceLimit });
  const performance = evaluateRecommendationPerformanceV3(outcomes);
  const performanceRollups = evaluateRecommendationPerformanceRollupsV3(outcomes, {
    minimumDimensionBenchmarkSample: dimensionSampleGate,
  });
  const basePerformanceRollups = performanceRollups.filter((rollup) => rollup.scope === "BASE").length;
  const dimensionPerformanceRollups = performanceRollups.length - basePerformanceRollups;
  const createdAt = (options.now ?? new Date()).toISOString();
  const candidates = performance.flatMap((slice) => {
    const candidate = proposeRecommendationCalibrationV3(slice, {
      minimumBenchmarkSample: dimensionSampleGate,
      createdAt,
    });
    return candidate ? [candidate] : [];
  });

  const rollupPersistence = await persistRecommendationPerformanceRollupsV3(performanceRollups, {
    sourceLimit,
    dimensionSampleGate,
    evaluatedAt: createdAt,
  });
  const performanceRollupsPersisted = rollupPersistence.ok ? rollupPersistence.persisted : 0;
  const performanceRollupPersistenceFailed = rollupPersistence.ok ? 0 : 1;

  let created = 0;
  let refreshed = 0;
  let deduplicated = 0;
  let failed = performanceRollupPersistenceFailed;
  for (const candidate of candidates) {
    const persisted = await persistRecommendationCalibrationCandidateV3(candidate);
    if (!persisted.ok) {
      failed += 1;
    } else if (persisted.created) {
      created += 1;
    } else if (persisted.refreshed) {
      refreshed += 1;
    } else {
      deduplicated += 1;
    }
  }

  return {
    outcomes: outcomes.length,
    performanceSlices: performance.length,
    performanceRollups: performanceRollups.length,
    performanceRollupsPersisted,
    performanceRollupPersistenceFailed,
    basePerformanceRollups,
    dimensionPerformanceRollups,
    driftSlices: candidates.length,
    created,
    refreshed,
    deduplicated,
    failed,
  };
}
