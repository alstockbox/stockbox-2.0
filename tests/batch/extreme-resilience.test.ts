import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BATCH_ITEM_EXECUTION_TIMEOUT_MS,
  BATCH_ITEM_MAX_ATTEMPTS,
  cumulativeBatchItemAttempt,
  mapWithBoundedConcurrency,
  staleBatchItemDisposition,
  withBatchItemDeadline,
} from "@/lib/batch/durable";
import { DURABLE_WORKER_TRIGGER_TIMEOUT_MS } from "@/lib/batch/worker-trigger";
import { staleJobRecoverySchedule } from "@/lib/jobs/background-jobs";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

describe("extreme batch resilience", () => {
  it("requeues a stale processing item while retry budget remains", () => {
    expect(staleBatchItemDisposition({
      status: "processing",
      attempts: 2,
      updatedAt: "2026-09-07T12:46:50.000Z",
    }, new Date("2026-09-07T13:00:00.000Z"))).toBe("requeue");
  });

  it("permanently fails a stale processing item after the retry budget is exhausted", () => {
    expect(staleBatchItemDisposition({
      status: "processing",
      attempts: BATCH_ITEM_MAX_ATTEMPTS,
      updatedAt: "2026-09-07T12:46:50.000Z",
    }, new Date("2026-09-07T13:00:00.000Z"))).toBe("fail");
  });

  it("leaves fresh processing items alone", () => {
    expect(staleBatchItemDisposition({
      status: "processing",
      attempts: 1,
      updatedAt: "2026-09-07T12:59:30.000Z",
    }, new Date("2026-09-07T13:00:00.000Z"))).toBe("keep");
  });

  it("puts a hard deadline around a hung item", async () => {
    await expect(withBatchItemDeadline(
      new Promise<never>(() => undefined),
      5,
    )).rejects.toThrow("Batch item execution deadline exceeded");
  });

  it("signals lease invalidation synchronously when the item deadline expires", async () => {
    let invalidated = false;
    await expect(withBatchItemDeadline(
      new Promise<never>(() => undefined),
      5,
      () => { invalidated = true; },
    )).rejects.toThrow("Batch item execution deadline exceeded");
    expect(invalidated).toBe(true);
  });

  it("keeps item attempts cumulative when an orphaned worker job is reconstructed", () => {
    expect(cumulativeBatchItemAttempt(1, 0)).toBe(1);
    expect(cumulativeBatchItemAttempt(2, 0)).toBe(2);
    expect(cumulativeBatchItemAttempt(1, 2)).toBe(3);
    expect(cumulativeBatchItemAttempt(2, 2)).toBe(4);
  });

  it("caps orchestration concurrency while preserving result order", async () => {
    let active = 0;
    let maxActive = 0;
    const values = await mapWithBoundedConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2));
      active -= 1;
      return value * 10;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(values).toEqual([10, 20, 30, 40, 50]);
  });

  it("never requeues a stale background job beyond max attempts", () => {
    expect(staleJobRecoverySchedule(
      { attempts: 4, maxAttempts: 4 },
      new Date("2026-09-07T13:00:00.000Z"),
    )).toEqual({ status: "failed", availableAt: null });
    expect(staleJobRecoverySchedule(
      { attempts: 2, maxAttempts: 4 },
      new Date("2026-09-07T13:00:00.000Z"),
    )).toEqual({ status: "queued", availableAt: "2026-09-07T13:00:00.000Z" });
  });

  it("keeps the self-trigger alive longer than one item deadline", () => {
    expect(DURABLE_WORKER_TRIGGER_TIMEOUT_MS).toBeGreaterThan(BATCH_ITEM_EXECUTION_TIMEOUT_MS);
  });

  it("runs claimed jobs concurrently instead of serially", () => {
    const jobs = readFileSync(resolve(process.cwd(), "src/lib/jobs/background-jobs.ts"), "utf8");
    expect(jobs).toContain("await Promise.all(jobs.map");
  });

  it("uses bounded concurrency for initial enqueue and recovery scans", () => {
    const durable = readFileSync(resolve(process.cwd(), "src/lib/batch/durable.ts"), "utf8");
    const recovery = readFileSync(resolve(process.cwd(), "src/lib/batch/stale-recovery.ts"), "utf8");
    expect(durable).toMatch(/mapWithBoundedConcurrency\(\s*createdItems/);
    expect(recovery).toMatch(/mapWithBoundedConcurrency\(\s*result\.data \?\? \[\]/);
  });

  it("builds recovery indexes online without wrapping concurrent index creation in a transaction", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260907133500_batch_extreme_resilience_indexes.sql"),
      "utf8",
    );
    expect(migration.match(/create index concurrently if not exists/gi)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(migration).not.toMatch(/^\s*begin\s*;/im);
    expect(migration).not.toMatch(/^\s*commit\s*;/im);
  });

  it("executes batch durability and resilience index migrations in disposable Postgres CI", () => {
    const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/batch-resilience-db-ci.yml"), "utf8");
    expect(workflow).toContain("20260901153822_background_job_durability.sql");
    expect(workflow).toContain("20260901154120_durable_batch_runs.sql");
    expect(workflow).toContain("20260907133500_batch_extreme_resilience_indexes.sql");
    expect(workflow).toContain("Assert batch resilience indexes");
    expect(workflow).toContain("indisvalid");
  });

  it("fences background-job completion and failure to the exact claimed lease", () => {
    const jobs = readFileSync(resolve(process.cwd(), "src/lib/jobs/background-jobs.ts"), "utf8");
    expect(jobs).toContain("completeBackgroundJob(job: BackgroundJob)");
    expect(jobs.match(/\.eq\("attempts", job\.attempts\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(jobs.match(/\.eq\("locked_at", job\.lockedAt\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("checks the background-job lease before a batch item can be leased", () => {
    const durable = readFileSync(resolve(process.cwd(), "src/lib/batch/durable.ts"), "utf8");
    expect(durable).toContain("assertBackgroundJobLease(job)");
    expect(durable).toContain('.eq("locked_at", job.lockedAt)');
  });

  it("fences item writes to the exact worker lock token as well as its attempt", () => {
    const durable = readFileSync(resolve(process.cwd(), "src/lib/batch/durable.ts"), "utf8");
    expect(durable).toContain('.eq("started_at", leaseStartedAt)');
    expect(durable.match(/\.eq\("started_at", startedAt\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("recovers stale items before each worker pass and from status polling", () => {
    const workerRoute = readFileSync(resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"), "utf8");
    const statusRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/[id]/route.ts"), "utf8");
    expect(workerRoute).toContain("recoverStaleBatchItems");
    expect(statusRoute).toContain("recoverStaleBatchItems");
  });

  it("repairs queued batch items whose background job disappeared", () => {
    const recovery = readFileSync(resolve(process.cwd(), "src/lib/batch/stale-recovery.ts"), "utf8");
    expect(recovery).toContain("recoverOrphanedQueuedBatchItems");
    expect(recovery).toContain('.eq("status", "queued")');
    expect(recovery).toContain("deduplicated");
    expect(recovery).toContain("attemptOffset");
  });

  it("cancels processing items too so in-flight workers lose their item lease", () => {
    const durable = readFileSync(resolve(process.cwd(), "src/lib/batch/durable.ts"), "utf8");
    expect(durable).toContain('.in("status", ["queued", "processing"])');
  });

  it("keeps customer abuse protection while allowing sustained admin QA batches", () => {
    expect(RATE_LIMITS.adminBatchResolve.limit).toBeGreaterThanOrEqual(1_000);
    expect(RATE_LIMITS.batchResolve.limit).toBeLessThan(RATE_LIMITS.adminBatchResolve.limit);
    const resolveRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/resolve/route.ts"), "utf8");
    const createRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/route.ts"), "utf8");
    expect(resolveRoute).toContain('user.role === "admin" ? RATE_LIMITS.adminBatchResolve : RATE_LIMITS.batchResolve');
    expect(createRoute).toContain('user.role === "admin" ? RATE_LIMITS.adminBatchResolve : RATE_LIMITS.batchResolve');
  });
});
