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

function auditLineageRow(value: unknown): AuditLineageRowV3 | null {
  const row = persistenceRecord(value);
  if (!row) return null;
  if (typeof row.id !== "string" || typeof row.ticker !== "string") return null;
  if (typeof row.analysis_archetype !== "string"
      || typeof row.model_version !== "string"
      || typeof row.recommendation_policy_version !== "string") return null;
  if (typeof row.v3_rating !== "string" || !RATINGS.has(row.v3_rating as RecommendationV3Rating)) return null;

  return {
    id: row.id,
    ticker: row.ticker.trim().toUpperCase(),
    analysisArchetype: row.analysis_archetype,
    sector: normalizedDimension(row.sector),
    modelVersion: row.model_version,
    recommendationPolicyVersion: row.recommendation_policy_version,
    rating: row.v3_rating as RecommendationV3Rating,
    conviction: finiteNumber(row.conviction) ?? 0,
    dataQuality: finiteNumber(row.data_quality) ?? 0,
  };
}

export function recommendationOutcomeFromPersistenceV3(
  value: unknown,
  lineage: AuditLineageRowV3,
): RecommendationOutcomeV3 | null {
  const row = persistenceRecord(value);
  if (!row) return null;
  if (row.policy_version !== RECOMMENDATION_OUTCOME_POLICY_VERSION) return null;
  if (typeof row.horizon !== "string" || !OUTCOME_HORIZONS.has(row.horizon as RecommendationOutcomeHorizonV3)) return null;
  if (!validDate(row.expected_at) || !validDate(row.evaluated_at)) return null;

  const entryPrice = finiteNumber(row.entry_price);
  const observedPrice = finiteNumber(row.observed_price);
  const securityReturn = finiteNumber(row.security_return);
  if (entryPrice === null || entryPrice <= 0 || observedPrice === null || observedPrice <= 0 || securityReturn === null) return null;

  // Benchmark-relative evidence is accepted only when the row proves which
  // current assignment policy produced it. Legacy/stale benchmark evidence is
  // not deleted and the absolute security outcome remains usable, but all
  // relative fields are downgraded to missing so calibration cannot mix policy
  // generations or infer a benchmark that StockBox cannot reproduce.
  const benchmarkLineageCurrent = row.benchmark_policy_version === RECOMMENDATION_OUTCOME_BENCHMARK_POLICY_VERSION_V3;
  const benchmarkEntryPrice = benchmarkLineageCurrent ? finiteNumber(row.benchmark_entry_price) : null;
  const benchmarkObservedPrice = benchmarkLineageCurrent ? finiteNumber(row.benchmark_observed_price) : null;
  const benchmarkReturn = benchmarkLineageCurrent ? finiteNumber(row.benchmark_return) : null;
  const excessReturn = benchmarkLineageCurrent ? finiteNumber(row.excess_return) : null;
  const directionalHit = benchmarkLineageCurrent && typeof row.directional_hit === "boolean"
    ? row.directional_hit
    : null;

  return {
    policyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    snapshotId: lineage.id,
    ticker: lineage.ticker,
    rating: lineage.rating,
    analysisArchetype: lineage.analysisArchetype,
    sector: normalizedDimension(lineage.sector),
    modelVersion: lineage.modelVersion,
    recommendationPolicyVersion: lineage.recommendationPolicyVersion,
    horizon: row.horizon as RecommendationOutcomeHorizonV3,
    expectedAt: row.expected_at,
    evaluatedAt: row.evaluated_at,
    lagDays: Math.max(0, Math.trunc(finiteNumber(row.lag_days) ?? 0)),
    entryPrice,
    observedPrice,
    securityReturn,
    benchmarkTicker: benchmarkLineageCurrent && typeof row.benchmark_ticker === "string" && row.benchmark_ticker.trim()
      ? row.benchmark_ticker.trim().toUpperCase()
      : null,
    benchmarkEntryPrice,
    benchmarkObservedPrice,
    benchmarkReturn,
    excessReturn,
    directionalHit,
    conviction: lineage.conviction,
    dataQuality: lineage.dataQuality,
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
  const limit = Math.max(30, Math.min(options.limit ?? 5_000, 20_000));

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

  const sourceLimit = Math.max(30, Math.min(options.limit ?? 5_000, 20_000));
  const dimensionSampleGate = Math.max(20, options.minimumBenchmarkSample ?? 30);
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
