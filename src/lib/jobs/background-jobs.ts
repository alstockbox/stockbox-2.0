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

  const now = new Date().toISOString();
  const insert = await admin.from("background_jobs").insert({
    kind: input.kind,
    status: "queued",
    payload: input.payload,
    dedupe_key: input.dedupeKey ?? null,
    max_attempts: Math.max(1, Math.min(input.maxAttempts ?? 5, 10)),
    available_at: input.availableAt ?? now,
    updated_at: now,
  }).select("id").single();

  if (!insert.error && insert.data) {
    return { ok: true, id: String(insert.data.id), deduplicated: false };
  }
  if (insert.error?.code === "23505" && input.dedupeKey) {
    const existing = await admin.from("background_jobs")
      .select("id")
      .eq("kind", input.kind)
      .eq("dedupe_key", input.dedupeKey)
      .in("status", ["queued", "running"])
      .maybeSingle();
    if (existing.data) {
      return { ok: true, id: String(existing.data.id), deduplicated: true };
    }
  }
  return {
    ok: false,
    error: sanitizeDiagnosticMessage(insert.error?.message, "Unable to enqueue background job."),
  };
}

export async function claimBackgroundJobs(input: {
  kinds: string[];
  limit?: number;
  staleAfterMinutes?: number;
}): Promise<BackgroundJob[]> {
  const admin = createAdminClient();
  if (!admin || !input.kinds.length) return [];
  const now = new Date();
  const staleCutoff = new Date(
    now.getTime() - Math.max(5, input.staleAfterMinutes ?? 15) * 60_000,
  ).toISOString();

  await admin.from("background_jobs").update({
    status: "queued",
    locked_at: null,
    available_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq("status", "running").lt("locked_at", staleCutoff).in("kind", input.kinds);

  const candidates = await admin.from("background_jobs")
    .select("id,kind,status,payload,attempts,max_attempts,available_at,locked_at,dedupe_key")
    .eq("status", "queued")
    .in("kind", input.kinds)
    .lte("available_at", now.toISOString())
    .order("available_at", { ascending: true })
    .limit(Math.max(1, Math.min(input.limit ?? 10, 50)));
  if (candidates.error) return [];

  const claimed: BackgroundJob[] = [];
  for (const candidate of candidates.data ?? []) {
    const claim = await admin.from("background_jobs").update({
      status: "running",
      attempts: Number(candidate.attempts ?? 0) + 1,
      locked_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("id", candidate.id).eq("status", "queued")
      .select("id,kind,status,payload,attempts,max_attempts,available_at,locked_at,dedupe_key")
      .maybeSingle();
    if (claim.data) claimed.push(mapJob(claim.data as Record<string, unknown>));
  }
  return claimed;
}

export async function completeBackgroundJob(jobId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const now = new Date().toISOString();
  await admin.from("background_jobs").update({
    status: "completed",
    locked_at: null,
    completed_at: now,
    last_error: null,
    updated_at: now,
  }).eq("id", jobId).eq("status", "running");
}

export async function failBackgroundJob(job: BackgroundJob, error: unknown): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const now = new Date();
  const schedule = retryScheduleForJob(job, now);
  await admin.from("background_jobs").update({
    status: schedule.status,
    locked_at: null,
    completed_at: schedule.status === "failed" ? now.toISOString() : null,
    available_at: schedule.availableAt ?? now.toISOString(),
    last_error: sanitizeDiagnosticMessage(error, "Background job failed."),
    updated_at: now.toISOString(),
  }).eq("id", job.id).eq("status", "running");
}

export async function runBackgroundJobs(input: {
  handlers: Record<string, BackgroundJobHandler>;
  kinds?: string[];
  limit?: number;
}): Promise<{ claimed: number; completed: number; failed: number }> {
  const kinds = input.kinds ?? Object.keys(input.handlers);
  const jobs = await claimBackgroundJobs({ kinds, limit: input.limit });
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = input.handlers[job.kind];
    if (!handler) {
      await failBackgroundJob(job, new Error(`No handler registered for ${job.kind}.`));
      failed += 1;
      continue;
    }
    try {
      await handler(job);
      await completeBackgroundJob(job.id);
      completed += 1;
    } catch (error) {
      await failBackgroundJob(job, error);
      failed += 1;
    }
  }
  return { claimed: jobs.length, completed, failed };
}
