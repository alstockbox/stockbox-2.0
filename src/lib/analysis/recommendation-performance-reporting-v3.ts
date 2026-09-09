import type { RecommendationOutcomeHorizonV3 } from "@/lib/analysis/recommendation-learning-v3";
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

function normalizedQueryDimensions(
  query: RecommendationPerformanceReportQueryV3,
):
  | {
      scope: RecommendationPerformanceRollupScopeV3;
      sector: string | null;
      analysisArchetype: string | null;
      modelVersion: string | null;
      recommendationPolicyVersion: string | null;
    }
  | null {
  const raw = query as unknown as Record<string, unknown>;

  if (query.scope === "BASE") {
    if (hasForbiddenDimensions(raw, new Set())) return null;
    return {
      scope: "BASE",
      sector: null,
      analysisArchetype: null,
      modelVersion: null,
      recommendationPolicyVersion: null,
    };
  }

  if (query.scope === "SECTOR") {
    if (hasForbiddenDimensions(raw, new Set(["sector"]))) return null;
    const sector = normalizedRequiredDimension(raw.sector);
    if (sector === null) return null;
    return {
      scope: "SECTOR",
      sector,
      analysisArchetype: null,
      modelVersion: null,
      recommendationPolicyVersion: null,
    };
  }

  if (query.scope === "ANALYSIS_ARCHETYPE") {
    if (hasForbiddenDimensions(raw, new Set(["analysisArchetype"]))) return null;
    const analysisArchetype = normalizedRequiredDimension(raw.analysisArchetype);
    if (analysisArchetype === null) return null;
    return {
      scope: "ANALYSIS_ARCHETYPE",
      sector: null,
      analysisArchetype,
      modelVersion: null,
      recommendationPolicyVersion: null,
    };
  }

  if (query.scope !== "MODEL_LINEAGE") return null;
  if (hasForbiddenDimensions(raw, new Set(["analysisArchetype", "modelVersion", "recommendationPolicyVersion"]))) return null;
  const analysisArchetype = normalizedRequiredDimension(raw.analysisArchetype);
  const modelVersion = normalizedRequiredDimension(raw.modelVersion);
  const recommendationPolicyVersion = normalizedRequiredDimension(raw.recommendationPolicyVersion);
  if (analysisArchetype === null || modelVersion === null || recommendationPolicyVersion === null) return null;
  return {
    scope: "MODEL_LINEAGE",
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
 * There is deliberately no fallback from a requested gated dimension to BASE:
 * absence means the requested evidence slice is unavailable at this snapshot.
 */
export function selectRecommendationPerformanceRollupV3(
  snapshot: RecommendationPerformanceRollupSnapshotV3,
  query: RecommendationPerformanceReportQueryV3,
): RecommendationPerformanceReportSelectionV3 {
  const dimensions = normalizedQueryDimensions(query);
  if (dimensions === null) return { ok: false, reason: "INVALID_QUERY" };

  const rollup = snapshot.rollups.find((candidate) =>
    candidate.scope === dimensions.scope
    && candidate.horizon === query.horizon
    && candidate.rating === query.rating
    && candidate.sector === dimensions.sector
    && candidate.analysisArchetype === dimensions.analysisArchetype
    && candidate.modelVersion === dimensions.modelVersion
    && candidate.recommendationPolicyVersion === dimensions.recommendationPolicyVersion);

  if (!rollup) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, lineage: lineageOf(snapshot), rollup };
}
