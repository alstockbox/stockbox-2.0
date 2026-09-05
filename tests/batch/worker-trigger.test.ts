import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { boundedDurableWorkerDelayMs, MAX_DURABLE_WORKER_DELAY_MS } from "@/lib/batch/worker-trigger";

describe("durable batch worker chaining", () => {
  it("bounds delayed retry wakeups so one serverless invocation never sleeps indefinitely", () => {
    const now = Date.parse("2026-09-01T20:00:00.000Z");
    expect(boundedDurableWorkerDelayMs("2026-09-01T20:00:30.000Z", now)).toBe(30_000);
    expect(boundedDurableWorkerDelayMs("2026-09-01T20:10:00.000Z", now)).toBe(MAX_DURABLE_WORKER_DELAY_MS);
    expect(boundedDurableWorkerDelayMs("2026-09-01T19:59:00.000Z", now)).toBe(0);
  });

  it("keeps preview and production worker chaining on the current request origin", () => {
    const createRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/route.ts"), "utf8");
    const retryRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/[id]/retry/route.ts"), "utf8");
    const workerRoute = readFileSync(resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"), "utf8");
    expect(createRoute).toContain("new URL(request.url).origin");
    expect(retryRoute).toContain("new URL(request.url).origin");
    expect(workerRoute).toContain("new URL(request.url).origin");
    expect(workerRoute).toContain("nextDurableBatchWorkerDelayMs");
    expect(workerRoute).toContain("export const maxDuration = 300");
  });

  it("drains several queued jobs per worker invocation", () => {
    const workerRoute = readFileSync(resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"), "utf8");
    expect(workerRoute).toContain("runDurableBatchJobs(5)");
  });

  it("self-heals a stranded batch when queued items exist without active processing", () => {
    const statusRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/[id]/route.ts"), "utf8");
    expect(statusRoute).toContain('item.status === "queued"');
    expect(statusRoute).toContain('item.status === "processing"');
    expect(statusRoute).toContain("hasQueuedItems && !hasProcessingItems");
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
