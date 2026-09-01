import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { retryScheduleForJob } from "@/lib/jobs/background-jobs";

describe("durable background jobs", () => {
  it("retries bounded failures and permanently fails at max attempts", () => {
    expect(retryScheduleForJob(
      { attempts: 1, maxAttempts: 3 },
      new Date("2026-09-01T10:00:00Z"),
    )).toEqual({
      status: "queued",
      availableAt: "2026-09-01T10:01:00.000Z",
    });
    expect(retryScheduleForJob(
      { attempts: 3, maxAttempts: 3 },
      new Date("2026-09-01T10:00:00Z"),
    )).toEqual({
      status: "failed",
      availableAt: null,
    });
  });

  it("enforces one active job per kind and dedupe key in the database", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260901153822_background_job_durability.sql"),
      "utf8",
    );
    expect(migration).toContain("background_jobs_active_dedupe_idx");
    expect(migration).toContain("where dedupe_key is not null and status in ('queued', 'running')");
  });
});
