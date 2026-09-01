import { getServerEnv } from "@/lib/env/server";

export const MAX_DURABLE_WORKER_DELAY_MS = 90_000;

export function boundedDurableWorkerDelayMs(availableAt: string, nowMs = Date.now()): number {
  const availableAtMs = Date.parse(availableAt);
  if (!Number.isFinite(availableAtMs)) return 0;
  return Math.max(0, Math.min(MAX_DURABLE_WORKER_DELAY_MS, availableAtMs - nowMs));
}

export async function triggerDurableBatchWorker(input: { baseUrl?: string; delayMs?: number } = {}): Promise<boolean> {
  const env = getServerEnv();
  const secret = env.CRON_SECRET;
  const baseUrl = (input.baseUrl ?? env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "");
  if (!secret || !baseUrl) return false;

  const delayMs = Math.max(0, Math.min(input.delayMs ?? 0, MAX_DURABLE_WORKER_DELAY_MS));
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}/api/jobs/batch/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
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
