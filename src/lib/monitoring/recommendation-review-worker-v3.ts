import type { RecommendationV3ShadowEvent } from "@/lib/analysis/recommendation-v3-shadow";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import {
  analyzeCompany,
  searchCompanies,
  supportsUniversalSecurityAnalysis,
} from "@/lib/data/universal-security-live-provider";
import type { UniversalSecurityReport } from "@/lib/data/universal-security-provider";
import {
  claimRecommendationReviewRequestsV3,
  completeRecommendationReviewRequestV3,
  failRecommendationReviewRequestV3,
  retryRecommendationReviewRequestV3,
  type ClaimedRecommendationReviewRequestV3,
} from "@/lib/db/recommendation-review-requests-v3";
import { persistRecommendationV3ShadowAudit } from "@/lib/db/recommendation-v3-audit";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import {
  createSpecialistRecommendationV3ShadowEvent,
  requiresSpecialistRecommendationAuditV3,
} from "./recommendation-specialist-shadow-v3";

export type RecommendationReviewWorkerPauseReasonV3 =
  | "recommendation_v3_disabled"
  | "recommendation_engine_killed"
  | "background_jobs_killed";

export type RecommendationReviewWorkerGateV3 =
  | { allowed: true }
  | { allowed: false; reason: RecommendationReviewWorkerPauseReasonV3 };

export function recommendationReviewWorkerGateV3(overrides: {
  recommendationEnabled?: boolean;
  recommendationKilled?: boolean;
  backgroundJobsKilled?: boolean;
} = {}): RecommendationReviewWorkerGateV3 {
  const enabled = overrides.recommendationEnabled ?? isFeatureEnabled("recommendationV3");
  if (!enabled) return { allowed: false, reason: "recommendation_v3_disabled" };
  const recommendationKilled = overrides.recommendationKilled ?? isKilled("recommendationEngine");
  if (recommendationKilled) return { allowed: false, reason: "recommendation_engine_killed" };
  const backgroundJobsKilled = overrides.backgroundJobsKilled ?? isKilled("backgroundJobs");
  if (backgroundJobsKilled) return { allowed: false, reason: "background_jobs_killed" };
  return { allowed: true };
}

export type ObjectiveRecommendationReanalysisV3 =
  | { status: "ready"; event: RecommendationV3ShadowEvent }
  | { status: "retryable_failure"; error: string }
  | { status: "permanent_failure"; error: string };

export function recommendationReviewEventFromAnalysisV3(input: {
  data: UniversalSecurityReport;
  stockbox3?: {
    recommendationV3Shadow?: {
      status: string;
      event?: RecommendationV3ShadowEvent;
    };
  };
}): RecommendationV3ShadowEvent | null {
  // Specialist output is authoritative for ETFs and investment companies.
  // If the specialist audit cannot be produced, fail closed instead of falling
  // back to the pre-enrichment operating-company shadow, which could reintroduce
  // synthetic corporate assumptions for a specialist security.
  const specialist = createSpecialistRecommendationV3ShadowEvent(input.data);
  if (specialist) return specialist;
  if (requiresSpecialistRecommendationAuditV3(input.data)) return null;

  const shadow = input.stockbox3?.recommendationV3Shadow;
  return shadow?.status === "evaluated" && shadow.event ? shadow.event : null;
}

export async function runObjectiveRecommendationReanalysisV3(
  request: ClaimedRecommendationReviewRequestV3,
): Promise<ObjectiveRecommendationReanalysisV3> {
  if (request.requestedAction !== "RECOMPUTE_OBJECTIVE_RECOMMENDATION") {
    return { status: "permanent_failure", error: "INVALID_RECOMMENDATION_REVIEW_ACTION" };
  }
  if (!request.ticker.trim()) {
    return { status: "permanent_failure", error: "RECOMMENDATION_REVIEW_TICKER_REQUIRED" };
  }

  let candidates;
  try {
    candidates = await searchCompanies(request.ticker);
  } catch (error) {
    return {
      status: "retryable_failure",
      error: error instanceof Error ? error.message : "COMPANY_SEARCH_UNAVAILABLE",
    };
  }

  const resolution = resolveCanonicalCompanySelection(
    {
      ticker: request.ticker,
      canonicalTicker: request.ticker,
      name: request.ticker,
    },
    candidates,
  );
  if (!resolution.ok) {
    return {
      status: "permanent_failure",
      error: `RECOMMENDATION_REVIEW_COMPANY_${resolution.reason.toUpperCase()}`,
    };
  }
  if (!supportsUniversalSecurityAnalysis(resolution.company)) {
    return { status: "permanent_failure", error: "RECOMMENDATION_REVIEW_SECURITY_UNSUPPORTED" };
  }

  let analysis;
  try {
    analysis = await analyzeCompany({
      company: resolution.company,
      analysisType: "summary",
      investmentProfile: "balanced",
    });
  } catch (error) {
    return {
      status: "retryable_failure",
      error: error instanceof Error ? error.message : "OBJECTIVE_REANALYSIS_FAILED",
    };
  }
  if (!analysis.ok) {
    return { status: "retryable_failure", error: analysis.error || "OBJECTIVE_REANALYSIS_FAILED" };
  }

  const event = recommendationReviewEventFromAnalysisV3({
    data: analysis.data as UniversalSecurityReport,
    stockbox3: analysis.stockbox3,
  });
  if (!event) {
    return {
      status: "retryable_failure",
      error: "OBJECTIVE_REANALYSIS_DID_NOT_PRODUCE_RECOMMENDATION_V3_AUDIT",
    };
  }
  return { status: "ready", event };
}

export type RecommendationReviewWorkerResultV3 = {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  pausedReason?: RecommendationReviewWorkerPauseReasonV3;
};

type RecommendationReviewWorkerDependenciesV3 = {
  claimRequests: typeof claimRecommendationReviewRequestsV3;
  reanalyzeObjective: typeof runObjectiveRecommendationReanalysisV3;
  persistAudit: typeof persistRecommendationV3ShadowAudit;
  completeRequest: typeof completeRecommendationReviewRequestV3;
  retryRequest: typeof retryRecommendationReviewRequestV3;
  failRequest: typeof failRecommendationReviewRequestV3;
};

const defaultDependencies: RecommendationReviewWorkerDependenciesV3 = {
  claimRequests: claimRecommendationReviewRequestsV3,
  reanalyzeObjective: runObjectiveRecommendationReanalysisV3,
  persistAudit: persistRecommendationV3ShadowAudit,
  completeRequest: completeRecommendationReviewRequestV3,
  retryRequest: retryRecommendationReviewRequestV3,
  failRequest: failRecommendationReviewRequestV3,
};

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 7));
  return Math.min(5 * 60_000 * (2 ** exponent), 6 * 60 * 60_000);
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "UNKNOWN_RECOMMENDATION_REVIEW_WORKER_ERROR";
}

export async function runRecommendationReviewWorkerV3(options: {
  limit?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  now?: Date;
  gateOverrides?: Parameters<typeof recommendationReviewWorkerGateV3>[0];
  dependencies?: Partial<RecommendationReviewWorkerDependenciesV3>;
} = {}): Promise<RecommendationReviewWorkerResultV3> {
  const gate = recommendationReviewWorkerGateV3(options.gateOverrides);
  if (!gate.allowed) {
    return { claimed: 0, completed: 0, retried: 0, failed: 0, pausedReason: gate.reason };
  }

  const dependencies = { ...defaultDependencies, ...options.dependencies };
  const now = options.now ?? new Date();
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 4, 10));
  const claimed = await dependencies.claimRequests({
    limit: options.limit,
    leaseSeconds: options.leaseSeconds,
    now,
  });
  let completed = 0;
  let retried = 0;
  let failed = 0;

  const transitionFailure = async (
    request: ClaimedRecommendationReviewRequestV3,
    message: string,
    permanent: boolean,
  ) => {
    try {
      if (permanent || request.attempts >= maxAttempts) {
        await dependencies.failRequest(request.id, message, now);
        failed += 1;
      } else {
        const nextAttemptAt = new Date(now.getTime() + retryDelayMs(request.attempts));
        await dependencies.retryRequest(request.id, message, nextAttemptAt, now);
        retried += 1;
      }
    } catch {
      failed += 1;
    }
  };

  for (const request of claimed) {
    try {
      const reanalysis = await dependencies.reanalyzeObjective(request);
      if (reanalysis.status === "permanent_failure") {
        await transitionFailure(request, reanalysis.error, true);
        continue;
      }
      if (reanalysis.status === "retryable_failure") {
        await transitionFailure(request, reanalysis.error, false);
        continue;
      }

      // The live operating-company provider already attempts this write. We
      // deliberately perform the idempotent upsert here for every instrument,
      // including specialist ETF/investment-company events, and inspect the
      // result so COMPLETED always means durable objective V3 audit persistence.
      const audit = await dependencies.persistAudit(reanalysis.event);
      if (!audit.ok) {
        await transitionFailure(request, `RECOMMENDATION_V3_AUDIT_PERSIST_FAILED:${audit.error}`, false);
        continue;
      }

      try {
        await dependencies.completeRequest(request.id, now);
        completed += 1;
      } catch (error) {
        await transitionFailure(request, errorText(error), false);
      }
    } catch (error) {
      await transitionFailure(request, errorText(error), false);
    }
  }

  return { claimed: claimed.length, completed, retried, failed };
}
