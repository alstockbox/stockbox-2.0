export const BATCH_ITEM_MAX_ATTEMPTS = 4;
export const BATCH_ITEM_EXECUTION_TIMEOUT_MS = 210_000;
export const BATCH_ITEM_STALE_AFTER_MS = 5 * 60_000;
export const BATCH_ORCHESTRATION_CONCURRENCY = 8;

export type StaleBatchItemDisposition = "keep" | "requeue" | "fail";

export function cumulativeBatchItemAttempt(jobAttempts: number, attemptOffset = 0): number {
  const normalizedJobAttempts = Math.max(1, Math.floor(Number.isFinite(jobAttempts) ? jobAttempts : 1));
  const normalizedOffset = Math.max(0, Math.floor(Number.isFinite(attemptOffset) ? attemptOffset : 0));
  return normalizedOffset + normalizedJobAttempts;
}

export async function mapWithBoundedConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: limit }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
}

export function staleBatchItemDisposition(
  item: { status: string; attempts: number; updatedAt: string | null | undefined },
  now = new Date(),
): StaleBatchItemDisposition {
  if (item.status !== "processing") return "keep";
  const updatedAtMs = Date.parse(item.updatedAt ?? "");
  if (!Number.isFinite(updatedAtMs)) return item.attempts >= BATCH_ITEM_MAX_ATTEMPTS ? "fail" : "requeue";
  if (now.getTime() - updatedAtMs < BATCH_ITEM_STALE_AFTER_MS) return "keep";
  return item.attempts >= BATCH_ITEM_MAX_ATTEMPTS ? "fail" : "requeue";
}

export class BatchItemExecutionDeadlineError extends Error {
  constructor(timeoutMs: number) {
    super(`Batch item execution deadline exceeded after ${timeoutMs}ms.`);
    this.name = "BatchItemExecutionDeadlineError";
  }
}

export class BatchItemLeaseLostError extends Error {
  constructor() {
    super("Batch item lease was lost to a newer attempt.");
    this.name = "BatchItemLeaseLostError";
  }
}

export async function withBatchItemDeadline<T>(
  work: Promise<T>,
  timeoutMs = BATCH_ITEM_EXECUTION_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new BatchItemExecutionDeadlineError(timeoutMs));
        }, Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
