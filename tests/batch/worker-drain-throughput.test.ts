import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BATCH_ORCHESTRATION_CONCURRENCY } from "@/lib/batch/durable";

describe("batch worker drain throughput", () => {
  it("drains at least one orchestration-concurrency wave per worker invocation", () => {
    expect(BATCH_ORCHESTRATION_CONCURRENCY).toBeGreaterThanOrEqual(8);

    const workerRoute = readFileSync(
      resolve(process.cwd(), "src/app/api/jobs/batch/run/route.ts"),
      "utf8",
    );

    expect(workerRoute).toContain("BATCH_ORCHESTRATION_CONCURRENCY");
    expect(workerRoute).toContain("runDurableBatchJobs(BATCH_ORCHESTRATION_CONCURRENCY)");
    expect(workerRoute).not.toMatch(/runDurableBatchJobs\(3\)/);
  });
});
