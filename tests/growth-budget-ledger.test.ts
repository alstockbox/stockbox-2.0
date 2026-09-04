import { describe, expect, it } from "vitest";
import {
  appendGrowthSpend,
  authorizeGrowthOperation,
  getCurrentGrowthSpend,
  type GrowthBudgetDb,
  type GrowthBudgetEntry,
  type GrowthBudgetLedgerRow,
} from "../src/lib/growth/budget-ledger";

class FakeGrowthBudgetDb implements GrowthBudgetDb {
  rows: GrowthBudgetLedgerRow[] = [];
  insertedKeys = new Set<string>();
  lastSince: string | null = null;

  async listSpendSince(sinceIso: string) {
    this.lastSince = sinceIso;
    return this.rows;
  }

  async insertSpend(entry: GrowthBudgetEntry) {
    if (this.insertedKeys.has(entry.idempotencyKey)) return "duplicate" as const;
    this.insertedKeys.add(entry.idempotencyKey);
    this.rows.push({
      idempotency_key: entry.idempotencyKey,
      estimated_sek: entry.estimatedSek,
      actual_sek: entry.actualSek ?? null,
      created_at: entry.createdAt ?? new Date().toISOString(),
    });
    return "inserted" as const;
  }
}

describe("growth budget ledger", () => {
  it("uses actual spend when known and estimated spend otherwise", async () => {
    const db = new FakeGrowthBudgetDb();
    db.rows = [
      { idempotency_key: "a", estimated_sek: 4, actual_sek: 2.5, created_at: "2026-09-01T10:00:00Z" },
      { idempotency_key: "b", estimated_sek: "3.25", actual_sek: null, created_at: "2026-09-02T10:00:00Z" },
    ];

    await expect(getCurrentGrowthSpend(db, new Date("2026-09-04T12:00:00Z"))).resolves.toBe(5.75);
    expect(db.lastSince).toBe("2026-09-01T00:00:00.000Z");
  });

  it("treats repeated idempotency keys as a no-op", async () => {
    const db = new FakeGrowthBudgetDb();
    const entry: GrowthBudgetEntry = {
      idempotencyKey: "gemini:content-1:v3",
      provider: "gemini",
      operation: "content_generation",
      estimatedSek: 0.5,
    };

    await appendGrowthSpend(db, entry);
    await appendGrowthSpend(db, entry);
    expect(db.rows).toHaveLength(1);
  });

  it("denies a paid operation when projected cost is unknown", async () => {
    const db = new FakeGrowthBudgetDb();
    await expect(
      authorizeGrowthOperation(db, { projectedCostSek: null, optional: false }, new Date("2026-09-04T12:00:00Z")),
    ).resolves.toMatchObject({ allowed: false, reason: "unknown_cost" });
  });

  it("denies an operation that could cross the 75 SEK hard ceiling", async () => {
    const db = new FakeGrowthBudgetDb();
    db.rows = [
      { idempotency_key: "existing", estimated_sek: 74.5, actual_sek: null, created_at: "2026-09-01T10:00:00Z" },
    ];

    await expect(
      authorizeGrowthOperation(db, { projectedCostSek: 1, optional: false }, new Date("2026-09-04T12:00:00Z")),
    ).resolves.toMatchObject({ allowed: false, mode: "hard_stop", reason: "hard_cap" });
  });
});
