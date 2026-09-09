import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("background queue coordination liveness", () => {
  it("does not confuse database coordination failures with an empty or superseded queue", () => {
    const jobs = readFileSync(resolve(process.cwd(), "src/lib/jobs/background-jobs.ts"), "utf8");
    const durable = readFileSync(resolve(process.cwd(), "src/lib/batch/durable.ts"), "utf8");

    expect(jobs).toContain("Background job claim is temporarily unavailable.");
    expect(jobs).toContain("Background job lease update is temporarily unavailable.");
    expect(jobs).not.toContain("if (claim.error) return [];");
    expect(durable).toContain("Batch worker queue inspection is temporarily unavailable.");
    expect(durable).not.toContain("if (next.error || !next.data");
  });

  it("bounds worker recovery retries instead of silently waiting for the daily cron", () => {
    const trigger = readFileSync(resolve(process.cwd(), "src/lib/batch/worker-trigger.ts"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"), "utf8");

    expect(trigger).toContain("BATCH_WORKER_RECOVERY_RETRY_DELAYS_MS");
    expect(trigger).toContain("x-stockbox-batch-recovery-attempt");
    expect(route).toContain("nextDurableWorkerRecoveryDelayMs");
    expect(route).toContain("recoveryAttempt");
    expect(route).toContain("recoveryAttempt + 1");
  });
});
