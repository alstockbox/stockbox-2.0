import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BATCH_ORCHESTRATION_CONCURRENCY } from "@/lib/batch/durable";
import { BATCH_WORKER_CLAIM_LIMIT } from "@/lib/batch/worker-wave";

describe("batch worker drain throughput", () => {
  it("drains one full bounded orchestration wave per worker invocation", () => {
    expect(BATCH_ORCHESTRATION_CONCURRENCY).toBeGreaterThanOrEqual(8);
    expect(BATCH_WORKER_CLAIM_LIMIT).toBe(BATCH_ORCHESTRATION_CONCURRENCY);

    const workerRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"),
      "utf8",
    );
    const workerWave = readFileSync(
      resolve(process.cwd(), "src/lib/batch/worker-wave.ts"),
      "utf8",
    );

    expect(workerRoute).toContain("runDurableBatchWorkerWave");
    expect(workerRoute).not.toMatch(/runDurableBatchJobs\(3\)/);
    expect(workerWave).toContain("limit: BATCH_WORKER_CLAIM_LIMIT");
    expect(workerWave).toContain("handleBatchAnalysisJob");
    expect(workerWave).toContain("staleAfterMinutes: 5");
  });
});
