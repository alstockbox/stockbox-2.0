import {
  RECOMMENDATION_OUTCOME_HORIZONS_V3,
  type RecommendationOutcomeHorizonV3,
} from "@/lib/analysis/recommendation-learning-v3";
import type { RecommendationPerformanceRollupScopeV3 } from "@/lib/analysis/recommendation-performance-rollup-v3";
import type { RecommendationV3Rating } from "@/lib/analysis/recommendation-v3";
import type {
  RecommendationPerformanceRollupReadRowV3,
  RecommendationPerformanceRollupSnapshotV3,
} from "@/lib/db/recommendation-performance-rollups-v3";

export type RecommendationPerformanceReportQueryV3 =
  | {
      scope: "BASE";
      horizon: RecommendationOutcomeHorizonV3;
      rating: RecommendationV3Rating;
    }
  | {
      scope: "SECTOR";
      horizon: RecommendationOutcomeHorizonV3;
      rating: RecommendationV3Rating;
      sector: string;
    }
  | {
      scope: "ANALYSIS_ARCHETYPE";
      horizon: RecommendationOutcomeHorizonV3;
      rating: RecommendationV3Rating;
      analysisArchetype: string;
    }
  | {
      scope: "MODEL_LINEAGE";
      horizon: RecommendationOutcomeHorizonV3;
      rating: RecommendationV3Rating;
      analysisArchetype: string;
      modelVersion: string;
      recommendationPolicyVersion: string;
    };

export type RecommendationPerformanceReportLineageV3 = Omit<
  RecommendationPerformanceRollupSnapshotV3,
  "rollups"
>;

export type RecommendationPerformanceReportSelectionV3 =
  | {
      ok: true;
      lineage: RecommendationPerformanceReportLineageV3;
      rollup: RecommendationPerformanceRollupReadRowV3;
    }
  | {
      ok: false;
      reason: "INVALID_QUERY" | "NOT_FOUND";
    };

const PERFORMANCE_REPORT_HORIZONS_V3 = new Set<RecommendationOutcomeHorizonV3>(RECOMMENDATION_OUTCOME_HORIZONS_V3);
const PERFORMANCE_REPORT_RATINGS_V3 = new Set<RecommendationV3Rating>([
  "STRONG_BUY",
  "BUY",
  "WAIT",
  "HOLD",
  "REDUCE",
  "SELL",
  "UNAVAILABLE",
]);

function normalizedRequiredDimension(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function own(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasForbiddenDimensions(
  query: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  for (const key of ["sector", "analysisArchetype", "modelVersion", "recommendationPolicyVersion"]) {
    if (!allowed.has(key) && own(query, key)) return true;
  }
  return false;
}

function normalizedQuery(
  query: RecommendationPerformanceReportQueryV3,
):
  | {
      scope: RecommendationPerformanceRollupScopeV3;
      horizon: RecommendationOutcomeHorizonV3;
      rating: RecommendationV3Rating;
      sector: string | null;
      analysisArchetype: string | null;
      modelVersion: string | null;
      recommendationPolicyVersion: string | null;
    }
  | null {
  const value = query as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.horizon !== "string"
      || !PERFORMANCE_REPORT_HORIZONS_V3.has(raw.horizon as RecommendationOutcomeHorizonV3)) return null;
  if (typeof raw.rating !== "string"
      || !PERFORMANCE_REPORT_RATINGS_V3.has(raw.rating as RecommendationV3Rating)) return null;

  const horizon = raw.horizon as RecommendationOutcomeHorizonV3;
  const rating = raw.rating as RecommendationV3Rating;

  if (raw.scope === "BASE") {
    if (hasForbiddenDimensions(raw, new Set())) return null;
    return {
      scope: "BASE",
      horizon,
      rating,
      sector: null,
      analysisArchetype: null,
      modelVersion: null,
      recommendationPolicyVersion: null,
    };
  }

  if (raw.scope === "SECTOR") {
    if (hasForbiddenDimensions(raw, new Set(["sector"]))) return null;
    const sector = normalizedRequiredDimension(raw.sector);
    if (sector === null) return null;
    return {
      scope: "SECTOR",
      horizon,
      rating,
      sector,
      analysisArchetype: null,
      modelVersion: null,
      recommendationPolicyVersion: null,
    };
  }

  if (raw.scope === "ANALYSIS_ARCHETYPE") {
    if (hasForbiddenDimensions(raw, new Set(["analysisArchetype"]))) return null;
    const analysisArchetype = normalizedRequiredDimension(raw.analysisArchetype);
    if (analysisArchetype === null) return null;
    return {
      scope: "ANALYSIS_ARCHETYPE",
      horizon,
      rating,
      sector: null,
      analysisArchetype,
      modelVersion: null,
      recommendationPolicyVersion: null,
    };
  }

  if (raw.scope !== "MODEL_LINEAGE") return null;
  if (hasForbiddenDimensions(raw, new Set(["analysisArchetype", "modelVersion", "recommendationPolicyVersion"]))) return null;
  const analysisArchetype = normalizedRequiredDimension(raw.analysisArchetype);
  const modelVersion = normalizedRequiredDimension(raw.modelVersion);
  const recommendationPolicyVersion = normalizedRequiredDimension(raw.recommendationPolicyVersion);
  if (analysisArchetype === null || modelVersion === null || recommendationPolicyVersion === null) return null;
  return {
    scope: "MODEL_LINEAGE",
    horizon,
    rating,
    sector: null,
    analysisArchetype,
    modelVersion,
    recommendationPolicyVersion,
  };
}

function lineageOf(
  snapshot: RecommendationPerformanceRollupSnapshotV3,
): RecommendationPerformanceReportLineageV3 {
  return {
    evaluatedAt: snapshot.evaluatedAt,
    outcomePolicyVersion: snapshot.outcomePolicyVersion,
    benchmarkPolicyVersion: snapshot.benchmarkPolicyVersion,
    sourceLimit: snapshot.sourceLimit,
    dimensionSampleGate: snapshot.dimensionSampleGate,
  };
}

/**
 * Selects one exact reporting slice from one already-validated snapshot.
 * Runtime query validation is strict so malformed horizon/rating/scope input is
 * never misreported as an evidence miss. There is deliberately no fallback
 * from a requested gated dimension to BASE.
 */
export function selectRecommendationPerformanceRollupV3(
  snapshot: RecommendationPerformanceRollupSnapshotV3,
  query: RecommendationPerformanceReportQueryV3,
): RecommendationPerformanceReportSelectionV3 {
  const normalized = normalizedQuery(query);
  if (normalized === null) return { ok: false, reason: "INVALID_QUERY" };

  const rollup = snapshot.rollups.find((candidate) =>
    candidate.scope === normalized.scope
    && candidate.horizon === normalized.horizon
    && candidate.rating === normalized.rating
    && candidate.sector === normalized.sector
    && candidate.analysisArchetype === normalized.analysisArchetype
    && candidate.modelVersion === normalized.modelVersion
    && candidate.recommendationPolicyVersion === normalized.recommendationPolicyVersion);

  if (!rollup) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, lineage: lineageOf(snapshot), rollup };
}
