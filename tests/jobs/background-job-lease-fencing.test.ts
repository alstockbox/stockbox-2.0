import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "background_jobs") throw new Error(`Unexpected table: ${table}`);
      return {
        update: (patch: Record<string, unknown>) => {
          const filters: Array<{ column: string; value: unknown; op: "eq" | "is" }> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push({ column, value, op: "eq" as const });
              return builder;
            },
            is(column: string, value: unknown) {
              filters.push({ column, value, op: "is" as const });
              return builder;
            },
            select() {
              return builder;
            },
            async maybeSingle() {
              const row = state.row;
              if (!row) return { data: null, error: null };
              const matches = filters.every(({ column, value }) => row[column] === value);
              if (!matches) return { data: null, error: null };
              Object.assign(row, patch);
              return { data: { id: row.id }, error: null };
            },
          };
          return builder;
        },
      };
    },
  }),
}));

import {
  completeBackgroundJob,
  failBackgroundJob,
  type BackgroundJob,
} from "@/lib/jobs/background-jobs";

const staleClaim: BackgroundJob = {
  id: "job-1",
  kind: "lease-test",
  status: "running",
  payload: {},
  attempts: 1,
  maxAttempts: 5,
  availableAt: "2026-09-10T00:00:00.000Z",
  lockedAt: "2026-09-10T00:00:01.000Z",
  dedupeKey: null,
};

const currentClaim: BackgroundJob = {
  ...staleClaim,
  attempts: 2,
  lockedAt: "2026-09-10T00:06:00.000Z",
};

function resetToCurrentClaim() {
  state.row = {
    id: currentClaim.id,
    kind: currentClaim.kind,
    status: "running",
    payload: {},
    attempts: currentClaim.attempts,
    max_attempts: currentClaim.maxAttempts,
    available_at: currentClaim.availableAt,
    locked_at: currentClaim.lockedAt,
    dedupe_key: null,
    completed_at: null,
    last_error: null,
    updated_at: currentClaim.lockedAt,
  };
}

describe("background job lease fencing", () => {
  beforeEach(() => {
    resetToCurrentClaim();
  });

  it("rejects stale completion after a newer claim owns the job", async () => {
    const before = structuredClone(state.row);

    await expect(completeBackgroundJob(staleClaim)).resolves.toBe(false);
    expect(state.row).toEqual(before);

    await expect(completeBackgroundJob(currentClaim)).resolves.toBe(true);
    expect(state.row?.status).toBe("completed");
    expect(state.row?.locked_at).toBeNull();
  });

  it("rejects stale failure/retry after a newer claim owns the job", async () => {
    const before = structuredClone(state.row);

    await expect(failBackgroundJob(staleClaim, new Error("stale worker"))).resolves.toBe(false);
    expect(state.row).toEqual(before);

    await expect(failBackgroundJob(currentClaim, new Error("current worker"))).resolves.toBe(true);
    expect(state.row?.status).toBe("queued");
    expect(state.row?.locked_at).toBeNull();
  });
});
