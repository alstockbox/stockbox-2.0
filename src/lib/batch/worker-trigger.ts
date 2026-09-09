import { getServerEnv } from "@/lib/env/server";

export const MAX_DURABLE_WORKER_DELAY_MS = 30_000;
export const DURABLE_WORKER_TRIGGER_TIMEOUT_MS = 240_000;
export const BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS = [5_000, 15_000, 30_000] as const;
export const BATCH_WORKER_RECOVERY_ATTEMPT_HEADER = "x-stockbox-batch-recovery-attempt";

export function boundedDurableWorkerDelayMs(availableAt: string, nowMs = Date.now()): number {
  const availableAtMs = Date.parse(availableAt);
  if (!Number.isFinite(availableAtMs)) return 0;
  return Math.max(0, Math.min(MAX_DURABLE_WORKER_DELAY_MS, availableAtMs - nowMs));
}

export function nextDurableWorkerRecoveryDelayMs(attempt: number): number | null {
  const normalizedAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  return BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS[normalizedAttempt] ?? null;
}

export async function triggerDurableBatchWorker(input: {
  baseUrl?: string;
  delayMs?: number;
  recoveryAttempt?: number;
} = {}): Promise<boolean> {
  const env = getServerEnv();
  const secret = env.CRON_SECRET;
  const baseUrl = (input.baseUrl ?? env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "");
  if (!secret || !baseUrl) return false;

  const delayMs = Math.max(0, Math.min(input.delayMs ?? 0, MAX_DURABLE_WORKER_DELAY_MS));
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const recoveryAttempt = Number.isFinite(input.recoveryAttempt)
    ? Math.max(0, Math.floor(input.recoveryAttempt ?? 0))
    : 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DURABLE_WORKER_TRIGGER_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/jobs/batch/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        [BATCH_WORKER_RECOVERY_ATTEMPT_HEADER]: String(recoveryAttempt),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok || response.status === 207;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
