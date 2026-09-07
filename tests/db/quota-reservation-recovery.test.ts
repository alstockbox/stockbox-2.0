import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("analysis quota reservation crash recovery", () => {
  it("releases stale reservations inside the entitlement RPC before quota is counted", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260907154000_stale_analysis_quota_recovery.sql"),
      "utf8",
    );
    const cleanup = migration.indexOf("update public.analysis_quota_reservations");
    const countReserved = migration.indexOf("select count(*) into v_reserved_total");

    expect(cleanup).toBeGreaterThanOrEqual(0);
    expect(countReserved).toBeGreaterThan(cleanup);
    expect(migration).toContain("status = 'failed'");
    expect(migration).toContain("status = 'reserved'");
    expect(migration).toContain("updated_at < now() - interval '15 minutes'");
    expect(migration).toContain("pg_advisory_xact_lock");
  });
});
