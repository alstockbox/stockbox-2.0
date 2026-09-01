import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = () => readFileSync("supabase/migrations/20260901213000_public_stock_snapshots.sql", "utf8");

describe("public snapshot storage boundary", () => {
  it("keeps snapshot rows server-readable without exposing the full report through anon Supabase", () => {
    const migration = sql();
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke select on public.public_stock_snapshots from anon, authenticated");
    expect(migration).not.toContain("Public can read indexable stock snapshots");
    expect(migration).not.toContain("grant select on public.public_stock_snapshots to anon, authenticated");
  });
});
