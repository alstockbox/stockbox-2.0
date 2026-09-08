import {
  RECOMMENDATION_OUTCOME_POLICY_VERSION,
  RECOMMENDATION_OUTCOME_HORIZONS_V3,
  evaluateRecommendationOutcomeV3,
  recommendationOutcomeExpectedAtV3,
  type RecommendationOutcomeHorizonV3,
  type RecommendationSnapshotV3,
} from "@/lib/analysis/recommendation-learning-v3";
import {
  benchmarkCompanySelectionV3,
  benchmarkForCompanyV3,
} from "@/lib/analysis/market-benchmark-v3";
import type { RecommendationV3Rating } from "@/lib/analysis/recommendation-v3";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { fetchOutcomeMarketHistoryV3 } from "@/lib/data/outcome-market-history-v3";
import { searchCompanies } from "@/lib/data/provider";
import { persistRecommendationOutcomeV3 } from "@/lib/db/recommendation-outcomes-v3";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import {
  enqueueBackgroundJob,
  runBackgroundJobs,
  type BackgroundJob,
} from "@/lib/jobs/background-jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDueRecommendationOutcomeWorkV3,
  recommendationOutcomeJobDedupeKeyV3,
  selectEntryPriceObservationV3,
  selectHorizonPriceObservationV3,
  type RecommendationAuditForOutcomeV3,
} from "./recommendation-outcome-monitor-v3";

export const RECOMMENDATION_OUTCOME_JOB_KIND_V3 = "recommendation_outcome_v3" as const;

const DIRECTIONAL_RATINGS: RecommendationV3Rating[] = ["STRONG_BUY", "BUY", "REDUCE", "SELL"];
const AUDIT_PROJECTION = [
  "id",
  "observed_at",
  "ticker",
  "analysis_fingerprint",
  "analysis_archetype",
  "model_version",
  "recommendation_policy_version",
  "v3_rating",
  "objective_score",
  "conviction",
  "data_quality",
  "model_uncertainty",
  "reason_codes",
].join(",");

export type RecommendationOutcomeJobPayloadV3 = {
  auditId: string;
  horizon: RecommendationOutcomeHorizonV3;
  expectedAt: string;
};

export type RecommendationOutcomePauseReasonV3 =
  | "recommendation_v3_disabled"
  | "recommendation_engine_killed"
  | "background_jobs_killed";

export type RecommendationOutcomeTrackingGateV3 =
  | { allowed: true }
  | {
      allowed: false;
      reason: RecommendationOutcomePauseReasonV3;
    };

export function recommendationOutcomeTrackingGateV3(overrides: {
  recommendationEnabled?: boolean;
  recommendationKilled?: boolean;
  backgroundJobsKilled?: boolean;
} = {}): RecommendationOutcomeTrackingGateV3 {
  const recommendationEnabled = overrides.recommendationEnabled ?? isFeatureEnabled("recommendationV3");
  if (!recommendationEnabled) return { allowed: false, reason: "recommendation_v3_disabled" };

  const recommendationKilled = overrides.recommendationKilled ?? isKilled("recommendationEngine");
  if (recommendationKilled) return { allowed: false, reason: "recommendation_engine_killed" };

  const backgroundJobsKilled = overrides.backgroundJobsKilled ?? isKilled("backgroundJobs");
  if (backgroundJobsKilled) return { allowed: false, reason: "background_jobs_killed" };
  return { allowed: true };
}

function isHorizon(value: unknown): value is RecommendationOutcomeHorizonV3 {
  return typeof value === "string"
    && (RECOMMENDATION_OUTCOME_HORIZONS_V3 as readonly string[]).includes(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function validAuditId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

export function parseRecommendationOutcomeJobPayloadV3(
  payload: Record<string, unknown>,
): RecommendationOutcomeJobPayloadV3 | null {
  if (!validAuditId(payload.auditId) || !isHorizon(payload.horizon) || !validDate(payload.expectedAt)) return null;
  return {
    auditId: payload.auditId.trim(),
    horizon: payload.horizon,
    expectedAt: new Date(payload.expectedAt).toISOString(),
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function auditRow(value: unknown): RecommendationAuditForOutcomeV3 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!validAuditId(row.id) || !validDate(row.observed_at) || typeof row.ticker !== "string") return null;
  if (!DIRECTIONAL_RATINGS.includes(row.v3_rating as RecommendationV3Rating)) return null;
  if (typeof row.analysis_archetype !== "string"
      || typeof row.model_version !== "string"
      || typeof row.recommendation_policy_version !== "string") return null;

  return {
    id: row.id.trim(),
    observed_at: new Date(row.observed_at).toISOString(),
    ticker: row.ticker.trim().toUpperCase(),
    analysis_fingerprint: typeof row.analysis_fingerprint === "string" ? row.analysis_fingerprint : null,
    analysis_archetype: row.analysis_archetype,
    model_version: row.model_version,
    recommendation_policy_version: row.recommendation_policy_version,
    v3_rating: row.v3_rating as RecommendationV3Rating,
    objective_score: finiteOrNull(row.objective_score),
    conviction: finiteOrNull(row.conviction) ?? 0,
    data_quality: finiteOrNull(row.data_quality) ?? 0,
    model_uncertainty: finiteOrNull(row.model_uncertainty) ?? 100,
    reason_codes: Array.isArray(row.reason_codes)
      ? row.reason_codes.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function snapshotFromAudit(audit: RecommendationAuditForOutcomeV3): RecommendationSnapshotV3 {
  return {
    snapshotId: audit.id,
    observedAt: audit.observed_at,
    ticker: audit.ticker,
    analysisFingerprint: audit.analysis_fingerprint,
    analysisArchetype: audit.analysis_archetype,
    modelVersion: audit.model_version,
    recommendationPolicyVersion: audit.recommendation_policy_version,
    rating: audit.v3_rating,
    objectiveScore: audit.objective_score,
    conviction: audit.conviction,
    dataQuality: audit.data_quality,
    modelUncertainty: audit.model_uncertainty,
    reasonCodes: [...audit.reason_codes],
  };
}

async function loadOutcomeAuditV3(id: string): Promise<RecommendationAuditForOutcomeV3 | null> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const { data, error } = await admin
    .from("analysis_recommendation_v3_audit")
    .select(AUDIT_PROJECTION)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load recommendation audit: ${error.message}`);
  return auditRow(data);
}

export async function loadDueRecommendationOutcomeWorkV3(options: {
  limit?: number;
  now?: Date;
} = {}) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 250, 1_000));
  const oneDayAgo = new Date(now.getTime() - 86_400_000).toISOString();

  const { data: auditData, error: auditError } = await admin
    .from("analysis_recommendation_v3_audit")
    .select(AUDIT_PROJECTION)
    .in("v3_rating", DIRECTIONAL_RATINGS)
    .lte("observed_at", oneDayAgo)
    .order("observed_at", { ascending: true })
    .limit(limit);
  if (auditError) throw new Error(`Unable to load due recommendation audits: ${auditError.message}`);

  const audits = (auditData ?? []).flatMap((row) => {
    const parsed = auditRow(row);
    return parsed ? [parsed] : [];
  });
  if (audits.length === 0) return [];

  const ids = audits.map((audit) => audit.id);
  const { data: outcomeData, error: outcomeError } = await admin
    .from("analysis_recommendation_v3_outcomes")
    .select("recommendation_audit_id,horizon")
    .in("recommendation_audit_id", ids);
  if (outcomeError) throw new Error(`Unable to load completed recommendation outcomes: ${outcomeError.message}`);

  const completed = new Map<string, Set<RecommendationOutcomeHorizonV3>>();
  for (const row of outcomeData ?? []) {
    const id = typeof row.recommendation_audit_id === "string" ? row.recommendation_audit_id : "";
    const horizon = row.horizon;
    if (!id || !isHorizon(horizon)) continue;
    const horizons = completed.get(id) ?? new Set<RecommendationOutcomeHorizonV3>();
    horizons.add(horizon);
    completed.set(id, horizons);
  }

  return buildDueRecommendationOutcomeWorkV3({ audits, completed, now });
}

export type RecommendationOutcomeEnqueueResultV3 = {
  queued: number;
  deduplicated: number;
  failed: number;
  due: number;
  pausedReason?: RecommendationOutcomePauseReasonV3;
};

export async function enqueueDueRecommendationOutcomeJobsV3(options: {
  limit?: number;
  now?: Date;
} = {}): Promise<RecommendationOutcomeEnqueueResultV3> {
  const gate = recommendationOutcomeTrackingGateV3();
  if (!gate.allowed) {
    return { queued: 0, deduplicated: 0, failed: 0, due: 0, pausedReason: gate.reason };
  }

  const work = await loadDueRecommendationOutcomeWorkV3(options);
  let queued = 0;
  let deduplicated = 0;
  let failed = 0;
  for (const item of work) {
    const enqueue = await enqueueBackgroundJob({
      kind: RECOMMENDATION_OUTCOME_JOB_KIND_V3,
      dedupeKey: recommendationOutcomeJobDedupeKeyV3(item.audit.id, item.horizon),
      maxAttempts: 4,
      payload: {
        auditId: item.audit.id,
        horizon: item.horizon,
        expectedAt: item.expectedAt,
      },
    });
    if (!enqueue.ok) failed += 1;
    else if (enqueue.deduplicated) deduplicated += 1;
    else queued += 1;
  }
  return { queued, deduplicated, failed, due: work.length };
}

async function resolveCompanyForAuditV3(audit: RecommendationAuditForOutcomeV3) {
  const candidates = await searchCompanies(audit.ticker);
  const resolution = resolveCanonicalCompanySelection(
    {
      ticker: audit.ticker,
      canonicalTicker: audit.ticker,
      name: audit.ticker,
    },
    candidates,
  );
  if (!resolution.ok) throw new Error("Canonical company identity could not be resolved for recommendation outcome.");
  return resolution.company;
}

export async function handleRecommendationOutcomeJobV3(job: BackgroundJob): Promise<void> {
  const gate = recommendationOutcomeTrackingGateV3();
  if (!gate.allowed) throw new Error(`Recommendation outcome worker paused: ${gate.reason}`);

  const payload = parseRecommendationOutcomeJobPayloadV3(job.payload);
  if (!payload) throw new Error("Invalid recommendation outcome job payload.");

  const audit = await loadOutcomeAuditV3(payload.auditId);
  if (!audit) throw new Error("Recommendation audit is unavailable or not directional.");
  const snapshot = snapshotFromAudit(audit);
  const canonicalExpectedAt = recommendationOutcomeExpectedAtV3(snapshot, payload.horizon);
  if (canonicalExpectedAt !== payload.expectedAt) {
    throw new Error("Recommendation outcome job expectedAt does not match the canonical snapshot horizon.");
  }

  const company = await resolveCompanyForAuditV3(audit);
  const securityHistoryResult = await fetchOutcomeMarketHistoryV3(company);
  if (!securityHistoryResult.ok) {
    throw new Error(`Security outcome history unavailable: ${securityHistoryResult.reason}`);
  }

  const entry = selectEntryPriceObservationV3(securityHistoryResult.data, audit.observed_at);
  const observed = selectHorizonPriceObservationV3(securityHistoryResult.data, canonicalExpectedAt);
  if (!entry || !observed) {
    throw new Error("Verified security outcome prices are unavailable within the allowed date tolerance.");
  }

  const benchmark = benchmarkForCompanyV3(company);
  let benchmarkEntry = null as ReturnType<typeof selectEntryPriceObservationV3>;
  let benchmarkObserved = null as ReturnType<typeof selectHorizonPriceObservationV3>;
  if (benchmark) {
    const benchmarkHistoryResult = await fetchOutcomeMarketHistoryV3(benchmarkCompanySelectionV3(benchmark));
    if (!benchmarkHistoryResult.ok) {
      throw new Error(`Benchmark outcome history unavailable: ${benchmarkHistoryResult.reason}`);
    }
    benchmarkEntry = selectEntryPriceObservationV3(benchmarkHistoryResult.data, audit.observed_at);
    benchmarkObserved = selectHorizonPriceObservationV3(benchmarkHistoryResult.data, canonicalExpectedAt);
    if (!benchmarkEntry || !benchmarkObserved) {
      throw new Error("Verified benchmark outcome prices are unavailable within the allowed date tolerance.");
    }
  }

  const outcome = evaluateRecommendationOutcomeV3({
    snapshot,
    horizon: payload.horizon,
    entryPrice: entry.price,
    benchmarkTicker: benchmark?.ticker ?? null,
    benchmarkEntryPrice: benchmarkEntry?.price ?? null,
    observation: {
      observedAt: observed.observedAt,
      price: observed.price,
      benchmarkPrice: benchmarkObserved?.price ?? null,
    },
  });
  if (!outcome) throw new Error("Recommendation outcome could not be evaluated from verified observations.");

  const persisted = await persistRecommendationOutcomeV3({
    recommendationAuditId: audit.id,
    policyVersion: RECOMMENDATION_OUTCOME_POLICY_VERSION,
    horizon: payload.horizon,
    expectedAt: outcome.expectedAt,
    evaluatedAt: outcome.evaluatedAt,
    lagDays: outcome.lagDays,
    entryObservedAt: entry.observedAt,
    entryPrice: outcome.entryPrice,
    observedPrice: outcome.observedPrice,
    securityCurrency: entry.currency,
    securityReturn: outcome.securityReturn,
    benchmarkTicker: outcome.benchmarkTicker,
    benchmarkEntryObservedAt: benchmarkEntry?.observedAt ?? null,
    benchmarkEntryPrice: outcome.benchmarkEntryPrice,
    benchmarkObservedAt: benchmarkObserved?.observedAt ?? null,
    benchmarkObservedPrice: outcome.benchmarkObservedPrice,
    benchmarkReturn: outcome.benchmarkReturn,
    excessReturn: outcome.excessReturn,
    directionalHit: outcome.directionalHit,
    securityPriceSource: entry.provider ?? securityHistoryResult.diagnostic.provider,
    benchmarkPriceSource: benchmark
      ? benchmarkEntry?.provider ?? "yahoo-outcome-history-v3"
      : null,
  });
  if (!persisted.ok) throw new Error(`Unable to persist recommendation outcome: ${persisted.error}`);
}

export type DurableRecommendationOutcomeRunV3 = RecommendationOutcomeEnqueueResultV3 & {
  jobsClaimed: number;
  completed: number;
  workerFailed: number;
};

export async function runDurableRecommendationOutcomeMonitoringV3(options: {
  enqueueLimit?: number;
  workerLimit?: number;
  now?: Date;
} = {}): Promise<DurableRecommendationOutcomeRunV3> {
  const queued = await enqueueDueRecommendationOutcomeJobsV3({
    limit: options.enqueueLimit,
    now: options.now,
  });
  if (queued.pausedReason) {
    return { ...queued, jobsClaimed: 0, completed: 0, workerFailed: 0 };
  }

  const run = await runBackgroundJobs({
    kinds: [RECOMMENDATION_OUTCOME_JOB_KIND_V3],
    limit: Math.max(1, Math.min(options.workerLimit ?? 20, 50)),
    handlers: { [RECOMMENDATION_OUTCOME_JOB_KIND_V3]: handleRecommendationOutcomeJobV3 },
  });
  return {
    ...queued,
    jobsClaimed: run.claimed,
    completed: run.completed,
    workerFailed: run.failed,
    failed: queued.failed + run.failed,
  };
}
