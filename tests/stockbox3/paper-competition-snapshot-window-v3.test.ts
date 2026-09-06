import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260905223800_paper_competition_snapshot_window_v3.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("Paper Trading V3 competition snapshot window", () => {
  it("enforces competition snapshot timing at the database row boundary", () => {
    expect(migration).toContain("create or replace function private.enforce_paper_competition_snapshot_window_v3");
    expect(migration).toContain("before insert or update on public.paper_performance_snapshots_v3");
    expect(migration).toContain("for each row execute function private.enforce_paper_competition_snapshot_window_v3()");
  });

  it("resolves the snapshot account by both account id and owner before applying competition rules", () => {
    expect(migration).toContain("from public.paper_accounts_v3");
    expect(migration).toContain("where id = new.account_id");
    expect(migration).toContain("and user_id = new.user_id");
    expect(migration).toContain("account_type, competition_id");
    expect(migration).toContain("paper competition snapshot account unavailable");
  });

  it("keeps personal paper snapshots unaffected", () => {
    expect(migration).toContain("if v_account_type <> 'competition' then");
    expect(migration).toContain("return new;");
  });

  it("allows inclusive official boundaries but rejects competition snapshots outside them", () => {
    expect(migration).toContain("from public.paper_competitions_v3");
    expect(migration).toContain("where id = v_competition_id");
    expect(migration).toContain("if new.evaluated_at < v_starts_at");
    expect(migration).toContain("or new.evaluated_at > v_ends_at");
    expect(migration).toContain("paper competition snapshot outside official window");
    expect(migration).not.toContain("new.evaluated_at <= v_starts_at");
    expect(migration).not.toContain("new.evaluated_at >= v_ends_at");
  });

  it("keeps the private enforcement function unavailable to clients", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "revoke all on function private.enforce_paper_competition_snapshot_window_v3() from public, anon, authenticated",
    );
  });
});
