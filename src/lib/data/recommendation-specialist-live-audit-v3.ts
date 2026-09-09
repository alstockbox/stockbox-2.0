import type { RecommendationV3ShadowEvent } from "@/lib/analysis/recommendation-v3-shadow";
import {
  createSpecialistRecommendationV3ShadowEvent,
  requiresSpecialistRecommendationAuditV3,
} from "@/lib/analysis/recommendation-specialist-shadow-v3";
import { persistRecommendationV3ShadowAudit } from "@/lib/db/recommendation-v3-audit";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import type { UniversalSecurityReport } from "./universal-security-provider";

export type SpecialistLiveAuditResultV3 =
  | { status: "disabled" }
  | { status: "killed" }
  | { status: "not_specialist" }
  | { status: "unavailable"; error: "SPECIALIST_RECOMMENDATION_V3_AUDIT_UNAVAILABLE" }
  | { status: "evaluated"; event: RecommendationV3ShadowEvent; persisted: boolean; error?: string };

type SpecialistLiveAuditDependenciesV3 = {
  persistAudit: typeof persistRecommendationV3ShadowAudit;
};

const defaultDependencies: SpecialistLiveAuditDependenciesV3 = {
  persistAudit: persistRecommendationV3ShadowAudit,
};

/**
 * Fail-open side channel for ordinary live specialist analyses. It never changes
 * the report or user-visible recommendation. When Recommendation V3 is dark or
 * killed it performs no work; when enabled it persists only the same privacy-
 * minimized objective event used by the review worker.
 */
export async function persistSpecialistRecommendationLiveAuditV3(
  report: UniversalSecurityReport,
  options: {
    recommendationEnabled?: boolean;
    recommendationKilled?: boolean;
    observedAt?: string;
    dependencies?: Partial<SpecialistLiveAuditDependenciesV3>;
  } = {},
): Promise<SpecialistLiveAuditResultV3> {
  const enabled = options.recommendationEnabled ?? isFeatureEnabled("recommendationV3");
  if (!enabled) return { status: "disabled" };
  const killed = options.recommendationKilled ?? isKilled("recommendationEngine");
  if (killed) return { status: "killed" };

  const event = createSpecialistRecommendationV3ShadowEvent(report, options.observedAt);
  if (!event) {
    return requiresSpecialistRecommendationAuditV3(report)
      ? { status: "unavailable", error: "SPECIALIST_RECOMMENDATION_V3_AUDIT_UNAVAILABLE" }
      : { status: "not_specialist" };
  }
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  try {
    const persisted = await dependencies.persistAudit(event);
    if (!persisted.ok) {
      return { status: "evaluated", event, persisted: false, error: persisted.error };
    }
    return { status: "evaluated", event, persisted: true };
  } catch (error) {
    return {
      status: "evaluated",
      event,
      persisted: false,
      error: error instanceof Error ? error.message : "UNKNOWN_SPECIALIST_LIVE_AUDIT_ERROR",
    };
  }
}
