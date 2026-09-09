import { existsSync, readFileSync } from "node:fs";
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

  it("claims queued jobs through one database-atomic skip-locked primitive", () => {
    const jobs = readFileSync(resolve(process.cwd(), "src/lib/jobs/background-jobs.ts"), "utf8");
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260910001500_background_job_atomic_claim.sql",
    );

    expect(jobs).toContain('.rpc("claim_background_jobs"');
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(migration).toContain("create or replace function public.claim_background_jobs");
    expect(migration).toContain("for update");
    expect(migration).toContain("skip locked");
    expect(migration).toContain("attempts = jobs.attempts + 1");
    expect(migration).toContain("status = 'running'");
  });

  it("admits deduplicated jobs through one database-atomic primitive", () => {
    const jobs = readFileSync(resolve(process.cwd(), "src/lib/jobs/background-jobs.ts"), "utf8");
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/20260910003000_background_job_atomic_enqueue.sql",
    );

    expect(jobs).toContain('.rpc("enqueue_background_job"');
    expect(jobs).not.toContain('insert.error?.code === "23505"');
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(migration).toContain("create or replace function public.enqueue_background_job");
    expect(migration).toContain("on conflict do nothing");
    expect(migration).toContain("status in ('queued', 'running')");
    expect(migration).toContain("grant execute on function public.enqueue_background_job");
  });
});
