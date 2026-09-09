import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const queuePath = path.join(process.cwd(), "src/lib/jobs/background-jobs.ts");
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260909231500_background_job_lease_fencing.sql",
);
const queueSource = fs.readFileSync(queuePath, "utf8");
const migrationSource = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";

describe("Background job lease fencing", () => {
  it("persists an explicit lease owner and maps it onto claimed jobs", () => {
    expect(migrationSource).toContain("add column if not exists locked_by text");
    expect(queueSource).toContain("lockedBy: string | null");
    expect(queueSource).toContain("locked_by");
    expect(queueSource).toMatch(/lockedBy:\s*typeof row\.locked_by === "string"/);
  });

  it("rotates ownership on every claim and clears stale ownership before reclaim", () => {
    expect(queueSource).toContain('import { randomUUID } from "node:crypto"');
    expect(queueSource).toMatch(/locked_by:\s*null/);
    expect(queueSource).toMatch(/const lockedBy = randomUUID\(\)/);
    expect(queueSource).toMatch(/locked_by:\s*lockedBy/);
  });

  it("fences terminal mutations to the exact current lease owner", () => {
    const ownerFilters = queueSource.match(/\.eq\("locked_by", [^)]+\)/g) ?? [];
    expect(ownerFilters.length).toBeGreaterThanOrEqual(2);
    expect(queueSource).toMatch(/completeBackgroundJob\(job:/);
  });
});
