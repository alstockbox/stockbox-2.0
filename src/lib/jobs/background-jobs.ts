import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeDiagnosticMessage } from "@/lib/security/diagnostics";

export type BackgroundJob = {
  id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  lockedAt: string | null;
  dedupeKey: string | null;
};

export type BackgroundJobHandler = (job: BackgroundJob) => Promise<void>;

const BACKGROUND_JOB_CLAIM_UNAVAILABLE = "Background job claim is temporarily unavailable.";
const BACKGROUND_JOB_LEASE_UPDATE_UNAVAILABLE = "Background job lease update is temporarily unavailable.";

export function retryScheduleForJob(
  job: Pick<BackgroundJob, "attempts" | "maxAttempts">,
  now = new Date(),
): { status: "queued" | "failed"; availableAt: string | null } {
  if (job.attempts >= job.maxAttempts) return { status: "failed", availableAt: null };
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, job.attempts - 1)));
  return {
    status: "queued",
    availableAt: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
  };
}

export function staleJobRecoverySchedule(
  job: Pick<BackgroundJob, "attempts" | "maxAttempts">,
  now = new Date(),
): { status: "queued" | "failed"; availableAt: string | null } {
  if (job.attempts >= job.maxAttempts) return { status: "failed", availableAt: null };
  return { status: "queued", availableAt: now.toISOString() };
}

function mapJob(row: Record<string, unknown>): BackgroundJob {
  return {
    id: String(row.id),
    kind: String(row.kind),
    status: String(row.status),
    payload: (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload : {}) as Record<string, unknown>,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    availableAt: String(row.available_at),
    lockedAt: typeof row.locked_at === "string" ? row.locked_at : null,
    dedupeKey: typeof row.dedupe_key === "string" ? row.dedupe_key : null,
  };
}

export async function enqueueBackgroundJob(input: {
  kind: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  maxAttempts?: number;
  availableAt?: string;
}): Promise<{ ok: true; id: string; deduplicated: boolean } | { ok: false; error: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Supabase admin client is unavailable." };

  const result = await admin.rpc("enqueue_background_job", {
    p_kind: input.kind,
    p_payload: input.payload,
    p_dedupe_key: input.dedupeKey ?? null,
    p_max_attempts: Math.max(1, Math.min(input.maxAttempts ?? 5, 10)),
    p_available_at: input.availableAt ?? new Date().toISOString(),
  });

  const row = Array.isArray(result.data)
    ? result.data[0] as Record<string, unknown> | undefined
    : result.data as Record<string, unknown> | null;

  if (!result.error && row?.id) {
    return {
      ok: true,
      id: String(row.id),
      deduplicated: row.deduplicated === true,
    };
  }

  return {
    ok: false,
    error: sanitizeDiagnosticMessage(result.error?.message, "Unable to enqueue background job."),
  };
}

export async function cancelQueuedBackgroundJobsByDedupeKeys(input: {
  kind: string;
  dedupeKeys: string[];
}): Promise<number> {
  const admin = createAdminClient();
  const dedupeKeys = [...new Set(input.dedupeKeys.filter(Boolean))];
  if (!admin || dedupeKeys.length === 0) return 0;

  const now = new Date().toISOString();
  const result = await admin.from("background_jobs").update({
    status: "cancelled",
    locked_at: null,
    completed_at: now,
    last_error: null,
    updated_at: now,
  }).eq("kind", input.kind)
    .eq("status", "queued")
    .in("dedupe_key", dedupeKeys)
    .select("id");

  if (result.error) return 0;
  return result.data?.length ?? 0;
}

async function recoverStaleBackgroundJobs(input: {
  kinds: string[];
  staleCutoff: string;
  now: Date;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error(BACKGROUND_JOB_CLAIM_UNAVAILABLE);
  const stale = await admin.from("background_jobs")
    .select("id,attempts,max_attempts,locked_at")
    .eq("status", "running")
    .lt("locked_at", input.staleCutoff)
    .in("kind", input.kinds)
    .limit(250);
  if (stale.error) throw new Error(BACKGROUND_JOB_CLAIM_UNAVAILABLE);

  const recoveryResults = await Promise.all((stale.data ?? []).map(async (row) => {
    const attempts = Number(row.attempts ?? 0);
    const schedule = staleJobRecoverySchedule({
      attempts,
      maxAttempts: Number(row.max_attempts ?? 5),
    }, input.now);
    let update = admin.from("background_jobs").update({
      status: schedule.status,
      locked_at: null,
      completed_at: schedule.status === "failed" ? input.now.toISOString() : null,
      available_at: schedule.availableAt ?? input.now.toISOString(),
      last_error: schedule.status === "failed"
        ? "Background job lease expired after exhausting its retry budget."
        : "Recovered stale background job lease.",
      updated_at: input.now.toISOString(),
    }).eq("id", row.id)
      .eq("status", "running")
      .eq("attempts", attempts);
    if (typeof row.locked_at === "string") update = update.eq("locked_at", row.locked_at);
    return update;
  }));
  if (recoveryResults.some((result) => result.error)) {
    throw new Error(BACKGROUND_JOB_CLAIM_UNAVAILABLE);
  }
}

export async function claimBackgroundJobs(input: {
  kinds: string[];
  limit?: number;
  staleAfterMinutes?: number;
}): Promise<BackgroundJob[]> {
  if (!input.kinds.length) return [];
  const admin = createAdminClient();
  if (!admin) throw new Error(BACKGROUND_JOB_CLAIM_UNAVAILABLE);
  const now = new Date();
  const staleCutoff = new Date(
    now.getTime() - Math.max(5, input.staleAfterMinutes ?? 15) * 60_000,
  ).toISOString();

  await recoverStaleBackgroundJobs({ kinds: input.kinds, staleCutoff, now });

  const claim = await admin.rpc("claim_background_jobs", {
    p_kinds: input.kinds,
    p_limit: Math.max(1, Math.min(input.limit ?? 10, 50)),
  });
  if (claim.error) throw new Error(BACKGROUND_JOB_CLAIM_UNAVAILABLE);

  return (claim.data ?? []).map((row: unknown) => mapJob(row as Record<string, unknown>));
}

export async function completeBackgroundJob(job: BackgroundJob): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) throw new Error(BACKGROUND_JOB_LEASE_UPDATE_UNAVAILABLE);
  const now = new Date().toISOString();
  let update = admin.from("background_jobs").update({
    status: "completed",
    locked_at: null,
    completed_at: now,
    last_error: null,
    updated_at: now,
  }).eq("id", job.id)
    .eq("status", "running")
    .eq("attempts", job.attempts);
  update = job.lockedAt ? update.eq("locked_at", job.lockedAt) : update.is("locked_at", null);
  const result = await update.select("id").maybeSingle();
  if (result.error) throw new Error(BACKGROUND_JOB_LEASE_UPDATE_UNAVAILABLE);
  return Boolean(result.data);
}

export async function failBackgroundJob(job: BackgroundJob, error: unknown): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) throw new Error(BACKGROUND_JOB_LEASE_UPDATE_UNAVAILABLE);
  const now = new Date();
  const schedule = retryScheduleForJob(job, now);
  let update = admin.from("background_jobs").update({
    status: schedule.status,
    locked_at: null,
    completed_at: schedule.status === "failed" ? now.toISOString() : null,
    available_at: schedule.availableAt ?? now.toISOString(),
    last_error: sanitizeDiagnosticMessage(error, "Background job failed."),
    updated_at: now.toISOString(),
  }).eq("id", job.id)
    .eq("status", "running")
    .eq("attempts", job.attempts);
  update = job.lockedAt ? update.eq("locked_at", job.lockedAt) : update.is("locked_at", null);
  const result = await update.select("id").maybeSingle();
  if (result.error) throw new Error(BACKGROUND_JOB_LEASE_UPDATE_UNAVAILABLE);
  return Boolean(result.data);
}

export async function runBackgroundJobs(input: {
  handlers: Record<string, BackgroundJobHandler>;
  kinds?: string[];
  limit?: number;
  staleAfterMinutes?: number;
}): Promise<{ claimed: number; completed: number; failed: number }> {
  const kinds = input.kinds ?? Object.keys(input.handlers);
  const jobs = await claimBackgroundJobs({
    kinds,
    limit: input.limit,
    staleAfterMinutes: input.staleAfterMinutes,
  });

  const outcomes = await Promise.all(jobs.map(async (job) => {
    const handler = input.handlers[job.kind];
    if (!handler) {
      const applied = await failBackgroundJob(job, new Error(`No handler registered for ${job.kind}.`));
      return applied ? "failed" as const : "superseded" as const;
    }

    try {
      await handler(job);
    } catch (error) {
      const applied = await failBackgroundJob(job, error);
      return applied ? "failed" as const : "superseded" as const;
    }

    const applied = await completeBackgroundJob(job);
    return applied ? "completed" as const : "superseded" as const;
  }));

  return {
    claimed: jobs.length,
    completed: outcomes.filter((outcome) => outcome === "completed").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}
