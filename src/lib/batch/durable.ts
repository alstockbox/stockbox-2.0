import { createHash, randomUUID } from "node:crypto";
import type {
  AnalysisReport,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile,
} from "@/lib/analysis/types";
import {
  BATCH_ITEM_EXECUTION_TIMEOUT_MS,
  BATCH_ITEM_MAX_ATTEMPTS,
  BATCH_ORCHESTRATION_CONCURRENCY,
  BatchItemLeaseLostError,
  cumulativeBatchItemAttempt,
  mapWithBoundedConcurrency,
  withBatchItemDeadline,
} from "@/lib/batch/resilience";
import { boundedDurableWorkerDelayMs } from "@/lib/batch/worker-trigger";
import { resolveMostRelevantCompanySelection } from "@/lib/data/company-resolution";
import { analyzeCompany, searchCompanies } from "@/lib/data/enhanced-provider";
import { canAttemptConfiguredFundamentals } from "@/lib/data/security-classification";
import {
  completeAnalysisReservation,
  getAnalysisReplay,
  persistAnalysis,
  recordUsageEvent,
  releaseAnalysisReservation,
  reserveAnalysisEntitlement,
} from "@/lib/db/repositories";
import {
  enqueueBackgroundJob,
  runBackgroundJobs,
  type BackgroundJob,
} from "@/lib/jobs/background-jobs";
import { recordMaterialAnalysisChangesForPersistedAnalysis } from "@/lib/research/analysis-changes";
import { createAdminClient } from "@/lib/supabase/admin";

export {
  BATCH_ITEM_EXECUTION_TIMEOUT_MS,
  BATCH_ITEM_MAX_ATTEMPTS,
  BATCH_ORCHESTRATION_CONCURRENCY,
  cumulativeBatchItemAttempt,
  mapWithBoundedConcurrency,
  staleBatchItemDisposition,
  withBatchItemDeadline,
} from "@/lib/batch/resilience";

export const BATCH_ANALYSIS_JOB_KIND = "batch_analysis_item";
export type DurableBatchRunStatus =
  | "queued"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type DurableBatchItemStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type BatchItemCounts = {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
};

export function batchJobDedupeKey(itemId: string): string {
  return `batch:item:${itemId}`;
}

export function shouldRetryBatchFailure(
  job: Pick<BackgroundJob, "attempts" | "maxAttempts">,
  reason: unknown,
): boolean {
  if (job.attempts >= job.maxAttempts) return false;
  if (!(reason instanceof Error)) return true;
  const message = reason.message;
  return !(
    message === "Monthly analysis limit reached." ||
    message === "Batch analysis idempotency conflict." ||
    message === "Analysis retry safety is unavailable." ||
    message === "Live fundamentals are unavailable for this security." ||
    message.startsWith("Company identity verification failed:")
  );
}

export function deriveBatchRunStatus(counts: BatchItemCounts): DurableBatchRunStatus {
  if (counts.total <= 0 || counts.cancelled === counts.total) return "cancelled";
  if (counts.processing > 0) return "processing";
  if (counts.queued > 0) return counts.completed > 0 || counts.failed > 0 ? "processing" : "queued";
  if (counts.completed === counts.total) return "completed";
  if (counts.completed > 0) return "partial";
  if (counts.failed > 0) return "failed";
  return "cancelled";
}

export type DurableBatchCreateItem = {
  input: string;
  company: CompanySearchResult;
};

export type DurableBatchRun = {
  id: string;
  userId: string;
  status: DurableBatchRunStatus;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  cancelledItems: number;
};

export type DurableBatchItem = {
  id: string;
  batchId: string;
  inputTicker: string;
  company: CompanySearchResult;
  status: DurableBatchItemStatus;
  attempts: number;
  idempotencyKey: string;
  analysisId: string | null;
  error: string | null;
};

function requestFingerprint(input: {
  company: CompanySearchResult;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
}): string {
  return createHash("sha256").update(JSON.stringify({
    securityId: input.company.securityId ?? null,
    canonicalTicker: input.company.canonicalTicker ?? input.company.ticker,
    issuerId: input.company.issuerId ?? null,
    entityId: input.company.entityId ?? null,
    cik: input.company.cik ?? null,
    analysisType: input.analysisType,
    investmentProfile: input.investmentProfile,
  })).digest("hex");
}

function batchItemFromRow(row: Record<string, unknown>): DurableBatchItem {
  return {
    id: String(row.id),
    batchId: String(row.batch_id),
    inputTicker: String(row.input_ticker),
    company: row.company as CompanySearchResult,
    status: row.status as DurableBatchItemStatus,
    attempts: Number(row.attempts ?? 0),
    idempotencyKey: String(row.idempotency_key),
    analysisId: typeof row.analysis_id === "string" ? row.analysis_id : null,
    error: typeof row.last_error === "string" ? row.last_error : null,
  };
}

async function refreshBatchRun(batchId: string): Promise<DurableBatchRunStatus> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const { data, error } = await admin
    .from("batch_items")
    .select("status")
    .eq("batch_id", batchId);
  if (error) throw new Error(`Unable to refresh batch state: ${error.message}`);

  const statuses = (data ?? []).map((row) => row.status as DurableBatchItemStatus);
  const counts: BatchItemCounts = {
    total: statuses.length,
    queued: statuses.filter((status) => status === "queued").length,
    processing: statuses.filter((status) => status === "processing").length,
    completed: statuses.filter((status) => status === "completed").length,
    failed: statuses.filter((status) => status === "failed").length,
    cancelled: statuses.filter((status) => status === "cancelled").length,
  };
  const status = deriveBatchRunStatus(counts);
  const terminal = ["completed", "partial", "failed", "cancelled"].includes(status);
  await admin.from("batch_runs").update({
    status,
    completed_items: counts.completed,
    failed_items: counts.failed,
    cancelled_items: counts.cancelled,
    completed_at: terminal ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", batchId);
  return status;
}

export async function createDurableBatch(input: {
  userId: string;
  analysisType: AnalysisType;
  investmentProfile: InvestmentProfile;
  items: DurableBatchCreateItem[];
}): Promise<{ batchId: string; queued: number }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  if (!input.items.length) throw new Error("Batch must contain at least one company.");
  if (input.items.length > 50) throw new Error("Batch exceeds the maximum row limit.");

  const { data: run, error: runError } = await admin.from("batch_runs").insert({
    user_id: input.userId,
    status: "queued",
    analysis_type: input.analysisType,
    investment_profile: input.investmentProfile,
    total_items: input.items.length,
  }).select("id").single();
  if (runError || !run) throw new Error(`Unable to create batch: ${runError?.message ?? "missing batch id"}`);

  const batchId = String(run.id);
  const itemRows = input.items.map((item) => ({
    batch_id: batchId,
    user_id: input.userId,
    input_ticker: item.input.trim().toUpperCase(),
    canonical_ticker: (item.company.canonicalTicker ?? item.company.ticker).trim().toUpperCase(),
    company_name: item.company.name,
    company: item.company,
    status: "queued",
    idempotency_key: randomUUID(),
  }));
  const { data: createdItems, error: itemError } = await admin
    .from("batch_items")
    .insert(itemRows)
    .select("id");
  if (itemError || !createdItems) {
    await admin.from("batch_runs").delete().eq("id", batchId).eq("user_id", input.userId);
    throw new Error(`Unable to create batch items: ${itemError?.message ?? "missing items"}`);
  }

  const enqueueResults = await mapWithBoundedConcurrency(
    createdItems,
    BATCH_ORCHESTRATION_CONCURRENCY,
    async (row) => {
      const itemId = String(row.id);
      const outcome = await enqueueBackgroundJob({
        kind: BATCH_ANALYSIS_JOB_KIND,
        dedupeKey: batchJobDedupeKey(itemId),
        maxAttempts: BATCH_ITEM_MAX_ATTEMPTS,
        payload: { batchItemId: itemId, attemptOffset: 0 },
      });
      if (outcome.ok) return true;

      await admin.from("batch_items").update({
        status: "failed",
        last_error: "Unable to enqueue batch analysis.",
        completed_at: new Date().toISOString(),
      }).eq("id", itemId).eq("status", "queued");
      return false;
    },
  );
  const queued = enqueueResults.filter(Boolean).length;
  await refreshBatchRun(batchId);
  return { batchId, queued };
}

function batchItemIdFromJob(job: BackgroundJob): string | null {
  const value = job.payload.batchItemId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function attemptOffsetFromJob(job: BackgroundJob): number {
  const value = job.payload.attemptOffset;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

const BATCH_LEASE_VERIFICATION_UNAVAILABLE = "Batch lease verification is temporarily unavailable.";
const BATCH_LEASE_UPDATE_UNAVAILABLE = "Batch lease update is temporarily unavailable.";

function throwIfExecutionExpired(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BatchItemLeaseLostError();
}

function assertLeaseReadResult(result: { data: unknown; error: unknown }): void {
  if (result.error) throw new Error(BATCH_LEASE_VERIFICATION_UNAVAILABLE);
  if (!result.data) throw new BatchItemLeaseLostError();
}

function assertLeaseMutationResult(result: { data: unknown; error: unknown }): void {
  if (result.error) throw new Error(BATCH_LEASE_UPDATE_UNAVAILABLE);
  if (!result.data) throw new BatchItemLeaseLostError();
}

async function assertBackgroundJobLease(job: BackgroundJob): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error(BATCH_LEASE_VERIFICATION_UNAVAILABLE);
  let query = admin.from("background_jobs")
    .select("id")
    .eq("id", job.id)
    .eq("status", "running")
    .eq("attempts", job.attempts);
  query = job.lockedAt ? query.eq("locked_at", job.lockedAt) : query.is("locked_at", null);
  const current = await query.maybeSingle();
  assertLeaseReadResult(current);
}

async function assertBatchItemLease(
  itemId: string,
  attempt: number,
  leaseStartedAt: string,
  signal?: AbortSignal,
): Promise<void> {
  throwIfExecutionExpired(signal);
  const admin = createAdminClient();
  if (!admin) throw new Error(BATCH_LEASE_VERIFICATION_UNAVAILABLE);
  const current = await admin.from("batch_items")
    .select("id")
    .eq("id", itemId)
    .eq("status", "processing")
    .eq("attempts", attempt)
    .eq("started_at", leaseStartedAt)
    .maybeSingle();
  throwIfExecutionExpired(signal);
  assertLeaseReadResult(current);
}

async function markItemFailure(
  job: BackgroundJob,
  item: DurableBatchItem,
  itemAttempt: number,
  error: unknown,
  permanent: boolean,
) {
  const admin = createAdminClient();
  if (!admin) return;
  const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown batch failure";
  let update = admin.from("batch_items").update({
    status: permanent ? "failed" : "queued",
    last_error: message,
    completed_at: permanent ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", item.id)
    .eq("status", "processing")
    .eq("attempts", itemAttempt);
  if (job.lockedAt) update = update.eq("started_at", job.lockedAt);
  const changed = await update.select("id").maybeSingle();
  if (changed.data) await refreshBatchRun(item.batchId);
}

async function executeBatchItem(
  job: BackgroundJob,
  item: DurableBatchItem,
  itemAttempt: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfExecutionExpired(signal);
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  if (["completed", "cancelled"].includes(item.status)) return;

  const { data: run, error: runError } = await admin
    .from("batch_runs")
    .select("user_id,status,analysis_type,investment_profile")
    .eq("id", item.batchId)
    .single();
  throwIfExecutionExpired(signal);
  if (runError || !run) throw new Error("Batch run could not be loaded.");
  if (run.status === "cancelled") {
    await admin.from("batch_items").update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", item.id).in("status", ["queued", "processing"]);
    return;
  }

  const userId = String(run.user_id);
  const analysisType = run.analysis_type as AnalysisType;
  const investmentProfile = run.investment_profile as InvestmentProfile;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single();
  throwIfExecutionExpired(signal);
  const isAdmin = profile?.role === "admin";
  const startedAt = job.lockedAt ?? new Date().toISOString();

  await assertBackgroundJobLease(job);
  throwIfExecutionExpired(signal);
  const lease = await admin.from("batch_items").update({
    status: "processing",
    attempts: itemAttempt,
    started_at: startedAt,
    last_error: null,
    updated_at: startedAt,
  }).eq("id", item.id)
    .in("status", ["queued", "processing"])
    .select("id")
    .maybeSingle();
  assertLeaseMutationResult(lease);

  await admin.from("batch_runs").update({
    status: "processing",
    started_at: startedAt,
    completed_at: null,
    updated_at: startedAt,
  }).eq("id", item.batchId).in("status", ["queued", "processing"]);

  const candidates = await searchCompanies(item.company.canonicalTicker ?? item.company.ticker);
  await assertBatchItemLease(item.id, itemAttempt, startedAt, signal);
  const resolution = resolveMostRelevantCompanySelection(item.company, candidates);
  if (!resolution.ok) throw new Error(`Company identity verification failed: ${resolution.reason}.`);
  const canonicalCompany = resolution.company;
  if (!canAttemptConfiguredFundamentals(canonicalCompany)) {
    throw new Error("Live fundamentals are unavailable for this security.");
  }

  const fingerprint = requestFingerprint({ company: canonicalCompany, analysisType, investmentProfile });
  const replay = await getAnalysisReplay({
    userId,
    idempotencyKey: item.idempotencyKey,
    requestFingerprint: fingerprint,
  });
  await assertBatchItemLease(item.id, itemAttempt, startedAt, signal);
  if (replay.status === "conflict") throw new Error("Batch analysis idempotency conflict.");
  if (replay.status === "unavailable") throw new Error("Analysis retry safety is unavailable.");
  if (replay.status === "replay") {
    const completed = await admin.from("batch_items").update({
      status: "completed",
      analysis_id: replay.id,
      completed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id)
      .eq("status", "processing")
      .eq("attempts", itemAttempt)
      .eq("started_at", startedAt)
      .select("id")
      .maybeSingle();
    assertLeaseMutationResult(completed);
    await refreshBatchRun(item.batchId);
    return;
  }

  let reservationId: string | null = null;
  if (!isAdmin) {
    const entitlement = await reserveAnalysisEntitlement({ userId, analysisType });
    if (!entitlement.configured) throw new Error("Analysis quotas are temporarily unavailable.");
    if (!entitlement.allowed) throw new Error("Monthly analysis limit reached.");
    reservationId = entitlement.reservationId ?? null;
  }
  await assertBatchItemLease(item.id, itemAttempt, startedAt, signal);
  try {
    const result = await analyzeCompany({
      company: canonicalCompany,
      analysisType,
      investmentProfile,
    });
    if (!result.ok) throw new Error(result.error || "Provider analysis failed.");

    await assertBatchItemLease(item.id, itemAttempt, startedAt, signal);
    const persisted = await persistAnalysis({
      userId,
      report: result.data,
      rawProviderWarnings: result.warnings,
      idempotencyKey: item.idempotencyKey,
      requestFingerprint: fingerprint,
    });
    if (!persisted.ok) {
      if (persisted.conflict) throw new Error("Batch analysis idempotency conflict.");
      throw new Error(persisted.error || "Analysis persistence failed.");
    }

    const analysisId = persisted.id;
    if (reservationId) {
      if ("replayed" in persisted && persisted.replayed) {
        await releaseAnalysisReservation({ reservationId, status: "released" });
      } else {
        await completeAnalysisReservation({ reservationId, analysisId });
      }
      reservationId = null;
    }

    await assertBatchItemLease(item.id, itemAttempt, startedAt, signal);
    const completed = await admin.from("batch_items").update({
      status: "completed",
      analysis_id: analysisId,
      completed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id)
      .eq("status", "processing")
      .eq("attempts", itemAttempt)
      .eq("started_at", startedAt)
      .select("id")
      .maybeSingle();
    assertLeaseMutationResult(completed);

    result.data.id = analysisId;
    await refreshBatchRun(item.batchId);
    await Promise.all([
      recordMaterialAnalysisChangesForPersistedAnalysis({
        userId,
        analysisId,
        report: result.data,
      }).catch(() => undefined),
      recordUsageEvent({
        userId,
        event: "analysis_completed",
        metadata: { ticker: result.data.ticker, batchId: item.batchId, batchItemId: item.id },
      }).catch(() => undefined),
    ]);
  } catch (error) {
    if (reservationId) {
      await releaseAnalysisReservation({ reservationId, status: "failed" }).catch(() => undefined);
    }
    throw error;
  }
}

export async function handleBatchAnalysisJob(job: BackgroundJob): Promise<void> {
  const itemId = batchItemIdFromJob(job);
  if (!itemId) return;
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const { data, error } = await admin.from("batch_items").select("*").eq("id", itemId).single();
  if (error || !data) throw new Error("Queued batch item could not be loaded.");
  const item = batchItemFromRow(data as Record<string, unknown>);
  const itemAttempt = cumulativeBatchItemAttempt(job.attempts, attemptOffsetFromJob(job));
  const deadline = new AbortController();

  try {
    await withBatchItemDeadline(
      executeBatchItem(job, item, itemAttempt, deadline.signal),
      BATCH_ITEM_EXECUTION_TIMEOUT_MS,
      () => deadline.abort(),
    );
  } catch (reason) {
    if (reason instanceof BatchItemLeaseLostError) return;
    const retryable = shouldRetryBatchFailure(job, reason);
    await markItemFailure(job, item, itemAttempt, reason, !retryable);
    if (!retryable) return;
    throw reason;
  }
}

export async function runDurableBatchJobs(limit = 2) {
  return runBackgroundJobs({
    kinds: [BATCH_ANALYSIS_JOB_KIND],
    limit: Math.max(1, Math.min(limit, 5)),
    staleAfterMinutes: 5,
    handlers: { [BATCH_ANALYSIS_JOB_KIND]: handleBatchAnalysisJob },
  });
}

export async function nextDurableBatchWorkerDelayMs(now = new Date()): Promise<number | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const next = await admin.from("background_jobs")
    .select("available_at")
    .eq("kind", BATCH_ANALYSIS_JOB_KIND)
    .eq("status", "queued")
    .order("available_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (next.error || !next.data || typeof next.data.available_at !== "string") return null;
  return boundedDurableWorkerDelayMs(next.data.available_at, now.getTime());
}

export async function getDurableBatchRun(input: { userId: string; batchId: string }) {
  const admin = createAdminClient();
  if (!admin) return { status: "unavailable" } as const;

  const { data: run, error: runError } = await admin.from("batch_runs")
    .select("id,user_id,status,analysis_type,investment_profile,total_items,completed_items,failed_items,cancelled_items,created_at,started_at,completed_at")
    .eq("id", input.batchId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (runError) return { status: "unavailable" } as const;
  if (!run) return { status: "not_found" } as const;

  const { data: items, error: itemsError } = await admin.from("batch_items")
    .select("id,input_ticker,canonical_ticker,company_name,status,analysis_id,last_error,attempts,created_at,started_at,completed_at,updated_at")
    .eq("batch_id", input.batchId)
    .eq("user_id", input.userId)
    .order("created_at", { ascending: true });
  if (itemsError) return { status: "unavailable" } as const;

  const analysisIds = (items ?? []).map((item) => item.analysis_id).filter((id): id is string => typeof id === "string");
  const reportById = new Map<string, AnalysisReport>();
  if (analysisIds.length) {
    const { data: analyses, error: analysesError } = await admin.from("analyses")
      .select("id,report")
      .eq("user_id", input.userId)
      .in("id", analysisIds);
    if (analysesError) return { status: "unavailable" } as const;
    for (const analysis of analyses ?? []) reportById.set(String(analysis.id), analysis.report as AnalysisReport);
  }

  return {
    status: "found",
    batch: {
      run,
      items: (items ?? []).map((item) => ({ ...item, report: item.analysis_id ? reportById.get(item.analysis_id) ?? null : null })),
    },
  } as const;
}

export async function retryDurableBatchFailures(input: { userId: string; batchId: string }) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  const { data: failed, error } = await admin.from("batch_items")
    .select("id")
    .eq("batch_id", input.batchId)
    .eq("user_id", input.userId)
    .eq("status", "failed");
  if (error) throw new Error(`Unable to load failed batch items: ${error.message}`);

  const retryResults = await mapWithBoundedConcurrency(
    failed ?? [],
    BATCH_ORCHESTRATION_CONCURRENCY,
    async (row) => {
      const itemId = String(row.id);
      const reset = await admin.from("batch_items").update({
        attempts: 0,
        started_at: null,
        last_error: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", itemId).eq("user_id", input.userId).eq("status", "failed");
      if (reset.error) return false;

      const outcome = await enqueueBackgroundJob({
        kind: BATCH_ANALYSIS_JOB_KIND,
        dedupeKey: batchJobDedupeKey(itemId),
        maxAttempts: BATCH_ITEM_MAX_ATTEMPTS,
        payload: { batchItemId: itemId, attemptOffset: 0 },
      });
      if (outcome.ok) return true;

      await admin.from("batch_items").update({
        status: "failed",
        last_error: "Unable to enqueue batch analysis retry.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", itemId).eq("user_id", input.userId).eq("status", "queued");
      return false;
    },
  );
  const queued = retryResults.filter(Boolean).length;

  if (queued) {
    await admin.from("batch_runs").update({
      status: "queued",
      completed_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", input.batchId).eq("user_id", input.userId);
  }
  await refreshBatchRun(input.batchId);
  return { queued };
}

export async function cancelDurableBatch(input: { userId: string; batchId: string }) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase admin client is unavailable.");
  await admin.from("batch_items").update({
    status: "cancelled",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("batch_id", input.batchId)
    .eq("user_id", input.userId)
    .in("status", ["queued", "processing"]);
  const status = await refreshBatchRun(input.batchId);
  return { status };
}