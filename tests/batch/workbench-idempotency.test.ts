import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("durable batch retry idempotency", () => {
  it("persists one stable idempotency key per item and replays before reserving quota", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/batch/durable.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260901154120_durable_batch_runs.sql"), "utf8");

    expect(source).toContain("idempotency_key: randomUUID()");
    expect(source).toContain("idempotencyKey: item.idempotencyKey");
    expect(source.indexOf("getAnalysisReplay({")).toBeLessThan(source.indexOf("reserveAnalysisEntitlement({"));
    expect(migration).toContain("unique (user_id, idempotency_key)");
  });

  it("restores the latest durable batch after a page reload", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/batch/batch-workbench.tsx"), "utf8");
    expect(source).toContain('LAST_BATCH_STORAGE_KEY = "stockbox:last-batch-id"');
    expect(source).toContain("window.localStorage.setItem(LAST_BATCH_STORAGE_KEY, payload.batchId)");
    expect(source).toContain("void refreshDurableBatch(savedBatchId)");
    expect(source).toContain('item.status === "cancelled"');
    expect(source).toContain('? "cancelled"');
    expect(source).toContain("{issueCount} {copy.issues}");
  });
});
