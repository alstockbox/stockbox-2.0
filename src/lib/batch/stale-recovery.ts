import { BATCH_ANALYSIS_JOB_KIND, batchJobDedupeKey } from "@/lib/batch/durable";
import {
  BATCH_ITEM_MAX_ATTEMPTS,
  BATCH_ITEM_STALE_AFTER_MS,
  BATCH_ORCHESTRATION_CONCURRENCY,
  mapWithBoundedConcurrency,
  staleBatchItemDisposition,
} from "@/lib/batch/resilience";
import { enqueueBackgroundJob } from "@/lib/jobs/background-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

const RECOVERY_SCAN_LIMIT = 250;
const QUEUED_ORPHAN_AFTER_MS = 60_000;

type BatchItemStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

function deriveRunStatus(statuses: BatchItemStatus[]) {
  const total = statuses.length;
  const queued = statuses.filter((status) => status === "queued").length;
  const processing = statuses.filter((status) => status === "processing").length;
  const completed = statuses.filter((status) => status === "completed").length;
  const failed = statuses.filter((status) => status === "failed").length;
  const cancelled = statuses.filter((status) => status === "cancelled").length;
  const status = total <= 0 || cancelled === total
    ? "cancelled"
    : processing > 0 || queued > 0
      ? (processing > 0 || completed > 0 || failed > 0 ? "processing" : "queued")
      : completed === total
        ? "completed"
        : completed > 0
          ? "partial"
          : failed > 0
            ? "failed"
            : "cancelled";
  return { total, queued, processing, completed, failed, cancelled, status };
}

async function reconcileBatchRun(batchId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const result = await admin.from("batch_items").select("status").eq("batch_id", batchId);
  if (result.error) return;
  const state = deriveRunStatus((result.data ?? []).map((row) => row.status as BatchItemStatus));
  const terminal = ["completed", "partial", "failed", "cancelled"].includes(state.status);
  const now = new Date().toISOString();
  await admin.from("batch_runs").update({
    status: state.status,
    completed_items: state.completed,
    failed_items: state.failed,
    cancelled_items: state.cancelled,
    completed_at: terminal ? now : null,
    updated_at: now,
  }).eq("id", batchId);
}

async function recoverOrphanedQueuedBatchItems(input: {
  batchId?: string;
  userId?: string;
  now: Date;
  affectedBatches: Set<string>;
}): Promise<{ scanned: number; requeued: number; failed: number }> {
  const admin = createAdminClient();
  if (!admin) return { scanned: 0, requeued: 0, failed: 0 };

  const cutoff = new Date(input.now.getTime() - QUEUED_ORPHAN_AFTER_MS).toISOString();
  let query = admin.from("batch_items")
    .select("id,batch_id,user_id,status,attempts,updated_at")
    .eq("status", "queued")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(RECOVERY_SCAN_LIMIT);
  if (input.batchId) query = query.eq("batch_id", input.batchId);
  if (input.userId) query = query.eq("user_id", input.userId);

  const result = await query;
  if (result.error) return { scanned: 0, requeued: 0, failed: 0 };

  let requeued = 0;
  let failed = 0;
  await mapWithBoundedConcurrency(result.data ?? [], BATCH_ORCHESTRATION_CONCURRENCY, async (row) => {
    const itemId = String(row.id);
    const batchId = String(row.batch_id);
    const attempts = Math.max(0, Number(row.attempts ?? 0));
    const originalUpdatedAt = typeof row.updated_at === "string" ? row.updated_at : null;

    if (attempts >= BATCH_ITEM_MAX_ATTEMPTS) {
      let update = admin.from("batch_items").update({
        status: "failed",
        last_error: "Queued batch item exhausted its retry budget before worker recovery.",
        completed_at: input.now.toISOString(),
        updated_at: input.now.toISOString(),
      }).eq("id", itemId).eq("status", "queued").eq("attempts", attempts);
      if (originalUpdatedAt) update = update.eq("updated_at", originalUpdatedAt);
      const changed = await update.select("id").maybeSingle();
      if (changed.data) {
        failed += 1;
        input.affectedBatches.add(batchId);
      }
      return;
    }

    const remainingAttempts = BATCH_ITEM_MAX_ATTEMPTS - attempts;
    const queued = await enqueueBackgroundJob({
      kind: BATCH_ANALYSIS_JOB_KIND,
      dedupeKey: batchJobDedupeKey(itemId),
      maxAttempts: remainingAttempts,
      payload: { batchItemId: itemId, attemptOffset: attempts },
      availableAt: input.now.toISOString(),
    });
    if (!queued.ok || queued.deduplicated) return;

    requeued += 1;
    input.affectedBatches.add(batchId);
    let update = admin.from("batch_items").update({
      last_error: "Recovered queued batch item whose worker job was missing.",
      updated_at: input.now.toISOString(),
    }).eq("id", itemId).eq("status", "queued").eq("attempts", attempts);
    if (originalUpdatedAt) update = update.eq("updated_at", originalUpdatedAt);
    await update;
  });

  return { scanned: result.data?.length ?? 0, requeued, failed };
}

export async function recoverStaleBatchItems(input: {
  batchId?: string;
  userId?: string;
  now?: Date;
} = {}): Promise<{ scanned: number; requeued: number; failed: number }> {
  const admin = createAdminClient();
  if (!admin) return { scanned: 0, requeued: 0, failed: 0 };

  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - BATCH_ITEM_STALE_AFTER_MS).toISOString();
  let query = admin.from("batch_items")
    .select("id,batch_id,user_id,status,attempts,updated_at")
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(RECOVERY_SCAN_LIMIT);
  if (input.batchId) query = query.eq("batch_id", input.batchId);
  if (input.userId) query = query.eq("user_id", input.userId);

  const result = await query;
  if (result.error) return { scanned: 0, requeued: 0, failed: 0 };

  let requeued = 0;
  let failed = 0;
  const affectedBatches = new Set<string>();

  await mapWithBoundedConcurrency(result.data ?? [], BATCH_ORCHESTRATION_CONCURRENCY, async (row) => {
    const attempts = Number(row.attempts ?? 0);
    const disposition = staleBatchItemDisposition({
      status: String(row.status),
      attempts,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    }, now);
    if (disposition === "keep") return;

    const itemId = String(row.id);
    const batchId = String(row.batch_id);
    const updatedAt = typeof row.updated_at === "string" ? row.updated_at : null;
    const timestamp = now.toISOString();

    if (disposition === "fail") {
      let update = admin.from("batch_items").update({
        status: "failed",
        last_error: "Stale batch attempt exhausted its retry budget.",
        completed_at: timestamp,
        updated_at: timestamp,
      }).eq("id", itemId).eq("status", "processing").eq("attempts", attempts);
      if (updatedAt) update = update.eq("updated_at", updatedAt);
      const changed = await update.select("id").maybeSingle();
      if (changed.data) {
        failed += 1;
        affectedBatches.add(batchId);
      }
      return;
    }

    let update = admin.from("batch_items").update({
      status: "queued",
      last_error: "Recovered stale batch attempt after worker interruption.",
      completed_at: null,
      updated_at: timestamp,
    }).eq("id", itemId).eq("status", "processing").eq("attempts", attempts);
    if (updatedAt) update = update.eq("updated_at", updatedAt);
    const changed = await update.select("id").maybeSingle();
    if (!changed.data) return;

    const queued = await enqueueBackgroundJob({
      kind: BATCH_ANALYSIS_JOB_KIND,
      dedupeKey: batchJobDedupeKey(itemId),
      maxAttempts: Math.max(1, BATCH_ITEM_MAX_ATTEMPTS - attempts),
      payload: { batchItemId: itemId, attemptOffset: attempts },
      availableAt: timestamp,
    });
    if (queued.ok) {
      requeued += 1;
      affectedBatches.add(batchId);
      return;
    }

    await admin.from("batch_items").update({
      status: "failed",
      last_error: "Recovered stale attempt but could not restore its worker job.",
      completed_at: timestamp,
      updated_at: timestamp,
    }).eq("id", itemId).eq("status", "queued").eq("attempts", attempts);
    failed += 1;
    affectedBatches.add(batchId);
  });

  const orphaned = await recoverOrphanedQueuedBatchItems({
    batchId: input.batchId,
    userId: input.userId,
    now,
    affectedBatches,
  });
  requeued += orphaned.requeued;
  failed += orphaned.failed;

  await Promise.all([...affectedBatches].map((batchId) => reconcileBatchRun(batchId)));
  return { scanned: (result.data?.length ?? 0) + orphaned.scanned, requeued, failed };
}
