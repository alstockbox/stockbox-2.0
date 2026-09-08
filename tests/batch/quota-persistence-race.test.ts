import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("batch quota persistence race", () => {
  it("settles the reservation immediately after persistence before lease invalidation can release a completed analysis", () => {
    const durable = readFileSync(resolve(process.cwd(), "src/lib/batch/durable.ts"), "utf8");
    const persistIndex = durable.indexOf("const persisted = await persistAnalysis");
    const analysisIdIndex = durable.indexOf("const analysisId = persisted.id", persistIndex);
    const completeIndex = durable.indexOf("await completeAnalysisReservation", analysisIdIndex);
    const firstPostPersistLeaseIndex = durable.indexOf(
      "await assertBatchItemLease(item.id, itemAttempt, startedAt, signal);",
      persistIndex,
    );

    expect(persistIndex).toBeGreaterThanOrEqual(0);
    expect(analysisIdIndex).toBeGreaterThan(persistIndex);
    expect(completeIndex).toBeGreaterThan(analysisIdIndex);
    expect(firstPostPersistLeaseIndex).toBeGreaterThan(completeIndex);
  });
});
