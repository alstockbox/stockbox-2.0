import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260907172000_portfolio_snapshot_ledger_revision.sql"),
  "utf8",
);

describe("portfolio snapshot ledger revision migration", () => {
  it("bumps a durable revision for every ledger mutation", () => {
    expect(sql).toContain("create table if not exists public.portfolio_ledger_revisions");
    expect(sql).toContain("after insert or update or delete on public.portfolio_transactions");
    expect(sql).toContain("revision = public.portfolio_ledger_revisions.revision + 1");
  });

  it("publishes snapshots only under the current locked revision", () => {
    expect(sql).toContain("for update;");
    expect(sql).toContain("if v_current_revision is distinct from p_expected_revision then");
    expect(sql).toContain("insert_portfolio_snapshot_if_current");
    expect(sql).toContain("ledger_revision");
  });
});
