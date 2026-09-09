import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("strict durable batch worker recovery", () => {
  it("surfaces recovery infrastructure failures to the worker retry chain", () => {
    const recovery = readFileSync(resolve(process.cwd(), "src/lib/batch/stale-recovery.ts"), "utf8");
    const workerRoute = readFileSync(resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"), "utf8");
    const statusRoute = readFileSync(resolve(process.cwd(), "src/app/api/batch/runs/[id]/route.ts"), "utf8");

    expect(recovery).toContain("strict?: boolean");
    expect(recovery).toContain("Batch recovery is temporarily unavailable.");
    expect(recovery).toContain("throwIfStrictRecoveryUnavailable");
    expect(recovery).not.toContain("if (result.error) return { scanned: 0, requeued: 0, failed: 0 };");
    expect(workerRoute).toContain("recoverStaleBatchItems({ strict: true })");
    expect(statusRoute).toContain("recoverStaleBatchItems({ userId: user.id, batchId: id })");
    expect(statusRoute).not.toContain("strict: true");
  });
});
