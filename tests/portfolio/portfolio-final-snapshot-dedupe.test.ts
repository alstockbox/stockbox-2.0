import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("portfolio final snapshot deduplication", () => {
  it("reuses the existing snapshot for a closed ledger at the same revision", () => {
    const migration = readFileSync(
      "supabase/migrations/20260908133000_portfolio_final_snapshot_dedupe.sql",
      "utf8",
    );

    expect(migration).toContain("insert_portfolio_snapshot_if_current");
    expect(migration).toMatch(/jsonb_array_length\(coalesce\(p_snapshot->'holdings',\s*'\[\]'::jsonb\)\)\s*=\s*0/);
    expect(migration).toMatch(/from\s+public\.portfolio_snapshots[\s\S]*portfolio_id\s*=\s*p_portfolio_id[\s\S]*ledger_revision\s*=\s*v_current_revision/i);
    expect(migration).toMatch(/return\s+query[\s\S]*select[\s\S]*created_at[\s\S]*ledger_revision/i);
  });

  it("does not deduplicate snapshots while active holdings remain", () => {
    const migration = readFileSync(
      "supabase/migrations/20260908133000_portfolio_final_snapshot_dedupe.sql",
      "utf8",
    );

    expect(migration).toMatch(/if\s+jsonb_array_length\(coalesce\(p_snapshot->'holdings',\s*'\[\]'::jsonb\)\)\s*=\s*0\s+then/i);
    expect(migration).toMatch(/end\s+if;[\s\S]*return\s+query[\s\S]*insert\s+into\s+public\.portfolio_snapshots/i);
  });
});
