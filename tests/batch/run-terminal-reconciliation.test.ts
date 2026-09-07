import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveRecoveredBatchRunState } from "@/lib/batch/stale-recovery";

describe("batch run terminal reconciliation", () => {
  it("derives partial when all items are terminal but completion is mixed", () => {
    expect(deriveRecoveredBatchRunState([
      ...Array.from({ length: 41 }, () => "completed" as const),
      ...Array.from({ length: 9 }, () => "cancelled" as const),
    ])).toEqual({
      total: 50,
      queued: 0,
      processing: 0,
      completed: 41,
      failed: 0,
      cancelled: 9,
      status: "partial",
    });
  });

  it("keeps a run nonterminal while any item is still active", () => {
    expect(deriveRecoveredBatchRunState(["completed", "queued", "cancelled"]).status).toBe("processing");
    expect(deriveRecoveredBatchRunState(["processing", "completed"]).status).toBe("processing");
  });

  it("scans nonterminal run rows even when no stale item was recovered", () => {
    const recovery = readFileSync(resolve(process.cwd(), "src/lib/batch/stale-recovery.ts"), "utf8");
    expect(recovery).toContain("recoverNonterminalBatchRuns");
    expect(recovery).toContain('.in("status", ["queued", "processing"])');
    expect(recovery).toContain("await recoverNonterminalBatchRuns");
  });
});
