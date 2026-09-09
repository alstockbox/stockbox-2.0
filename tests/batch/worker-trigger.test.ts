import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BATCH_ITEM_EXECUTION_TIMEOUT_MS } from "@/lib/batch/durable";
import { BATCH_ITEM_STALE_AFTER_MS } from "@/lib/batch/resilience";
import {
  BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS,
  boundedDurableWorkerDelayMs,
  DURABLE_WORKER_TRIGGER_TIMEOUT_MS,
  MAX_DURABLE_WORKER_DELAY_MS,
  nextDurableWorkerRecoveryDelayMs,
} from "@/lib/batch/worker-trigger";

describe("durable batch worker chaining", () => {
  it("bounds delayed retry wakeups so one serverless invocation never sleeps indefinitely", () => {
    const now = Date.parse("2026-09-01T20:00:00.000Z");
    expect(boundedDurableWorkerDelayMs("2026-09-01T20:00:30.000Z", now)).toBe(30_000);
    expect(boundedDurableWorkerDelayMs("2026-09-01T20:10:00.000Z", now)).toBe(MAX_DURABLE_WORKER_DELAY_MS);
    expect(boundedDurableWorkerDelayMs("2026-09-01T19:59:00.000Z", now)).toBe(0);
    expect(MAX_DURABLE_WORKER_DELAY_MS).toBeLessThanOrEqual(30_000);
    expect(BATCH_ITEM_EXECUTION_TIMEOUT_MS + MAX_DURABLE_WORKER_DELAY_MS).toBeLessThan(DURABLE_WORKER_TRIGGER_TIMEOUT_MS + 30_000);
  });

  it("bounds transient coordination recovery attempts through the stale lease horizon", () => {
    expect(BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS.slice(0, 3)).toEqual([5_000, 15_000, 30_000]);
    expect(BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS.every((delay) => delay <= MAX_DURABLE_WORKER_DELAY_MS)).toBe(true);
    expect(BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS.reduce((total, delay) => total + delay, 0)).toBeGreaterThan(BATCH_ITEM_STALE_AFTER_MS);
    expect(nextDurableWorkerRecoveryDelayMs(-1)).toBe(5_000);
    expect(nextDurableWorkerRecoveryDelayMs(0)).toBe(5_000);
    expect(nextDurableWorkerRecoveryDelayMs(1)).toBe(15_000);
    expect(nextDurableWorkerRecoveryDelayMs(2)).toBe(30_000);
    expect(nextDurableWorkerRecoveryDelayMs(BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS.length - 1)).toBe(30_000);
    expect(nextDurableWorkerRecoveryDelayMs(BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS.length)).toBeNull();
    expect(nextDurableWorkerRecoveryDelayMs(99)).toBeNull();
  });

  it("allows a chained worker request to outlive normal analysis latency", () => {
    expect(DURABLE_WORKER_TRIGGER_TIMEOUT_MS).toBeGreaterThanOrEqual(240_000);
  });

  it("keeps preview and production worker chaining on the current request origin", () => {
    const createRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/route.ts"), "utf8");
    const retryRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/[id]/retry/route.ts"), "utf8");
    const workerRoute = readFileSync(resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"), "utf8");
    const statusRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/[id]/route.ts"), "utf8");
    expect(createRoute).toContain("new URL(request.url).origin");
    expect(retryRoute).toContain("new URL(request.url).origin");
    expect(workerRoute).toContain("new URL(request.url).origin");
    expect(workerRoute).toContain("nextDurableBatchWorkerDelayMs");
    expect(workerRoute).toContain("export const maxDuration = 300");
    expect(statusRoute).toContain("export const maxDuration = 300");
  });

  it("drains several queued jobs per worker invocation with bounded concurrency", () => {
    const workerRoute = readFileSync(resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"), "utf8");
    const jobs = readFileSync(resolve(process.cwd(), "src/lib/jobs/background-jobs.ts"), "utf8");
    expect(workerRoute).toContain("runDurableBatchJobs(3)");
    expect(jobs).toContain("await Promise.all(jobs.map");
  });

  it("self-heals stranded queues without triggering another worker on every active status poll", () => {
    const statusRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/[id]/route.ts"), "utf8");
    expect(statusRoute).toContain("recoverStaleBatchItems");
    expect(statusRoute).toContain('item.status === "queued"');
    expect(statusRoute).toContain('item.status === "processing"');
    expect(statusRoute).toContain("if (hasQueuedItems && !hasProcessingItems)");
    expect(statusRoute).toContain("triggerDurableBatchWorker");
    expect(statusRoute).toContain("after(async ()");
    expect(statusRoute).toContain("new URL(request.url).origin");
  });

  it("removes queued background jobs when queued batch items are cancelled", () => {
    const cleanup = readFileSync(resolve(process.cwd(), "src/lib/batch/job-cleanup.ts"), "utf8");
    const cancelRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/[id]/cancel/route.ts"), "utf8");
    expect(cleanup).toContain("cancelQueuedBackgroundJobsByDedupeKeys");
    expect(cleanup).toContain("batchJobDedupeKey");
    expect(cancelRoute).toContain("cancelQueuedBatchJobsForBatch");
  });
});
