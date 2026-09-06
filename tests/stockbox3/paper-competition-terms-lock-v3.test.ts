import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260905223600_paper_competition_terms_lock_v3.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("Paper Trading V3 immutable competition terms", () => {
  it("locks fairness-critical terms after the first participant joins", () => {
    expect(migration).toContain("create or replace function private.enforce_paper_competition_terms_lock_v3");
    expect(migration).toContain("from public.paper_competition_entries_v3");
    expect(migration).toContain("where competition_id = old.id");
    expect(migration).toContain("old.kind is distinct from new.kind");
    expect(migration).toContain("old.base_currency is distinct from new.base_currency");
    expect(migration).toContain("old.starting_cash is distinct from new.starting_cash");
    expect(migration).toContain("old.starts_at is distinct from new.starts_at");
    expect(migration).toContain("old.join_deadline is distinct from new.join_deadline");
    expect(migration).toContain("old.ends_at is distinct from new.ends_at");
    expect(migration).toContain("old.max_participants is distinct from new.max_participants");
    expect(migration).toContain("paper competition fairness terms are immutable after first entry");
  });

  it("enforces the lock at the database row boundary", () => {
    expect(migration).toContain("before update on public.paper_competitions_v3");
    expect(migration).toContain("for each row execute function private.enforce_paper_competition_terms_lock_v3()");
  });

  it("does not freeze operational status transitions or display name", () => {
    expect(migration).not.toContain("old.status is distinct from new.status");
    expect(migration).not.toContain("old.name is distinct from new.name");
  });

  it("does not expose the private enforcement function to clients", () => {
    expect(migration).toContain(
      "revoke all on function private.enforce_paper_competition_terms_lock_v3() from public, anon, authenticated",
    );
  });
});