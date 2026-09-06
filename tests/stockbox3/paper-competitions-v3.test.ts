import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260905223500_paper_competitions_v3.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("Paper Trading V3 competition account foundation", () => {
  it("separates personal accounts from dedicated competition accounts", () => {
    expect(migration).toContain("add column if not exists account_type text");
    expect(migration).toContain("add column if not exists competition_id uuid");
    expect(migration).toContain("paper_accounts_v3_account_type_valid");
    expect(migration).toContain("account_type = 'personal' and competition_id is null");
    expect(migration).toContain("account_type = 'competition' and competition_id is not null");
  });

  it("stores immutable competition terms with fixed capital and one base currency", () => {
    expect(migration).toContain("create table if not exists public.paper_competitions_v3");
    expect(migration).toContain("starting_cash numeric(30,10) not null default 100000");
    expect(migration).toContain("check (starting_cash = 100000)");
    expect(migration).toContain("check (base_currency ~ '^[A-Z]{3}$')");
    expect(migration).toContain("check (ends_at > starts_at)");
    expect(migration).toContain("check (join_deadline <= starts_at)");
  });

  it("permits only one dedicated account per user and competition", () => {
    expect(migration).toContain("create unique index if not exists paper_accounts_v3_user_competition_unique");
    expect(migration).toContain("where account_type = 'competition'");
    expect(migration).toContain("unique (competition_id, user_id)");
    expect(migration).toContain("unique (account_id)");
  });

  it("joins by creating the competition account and cash server-side", () => {
    expect(migration).toContain("create or replace function public.join_paper_competition_v3");
    expect(migration).toContain("for update");
    expect(migration).toContain("paper competition is not open for joining");
    expect(migration).toContain("paper competition participant limit reached");
    expect(migration).toContain("'competition'");
    expect(migration).toContain("v_competition.base_currency");
    expect(migration).toContain("100000");
  });

  it("binds entry ownership to the dedicated account owner", () => {
    expect(migration).toContain("foreign key (account_id, user_id)");
    expect(migration).toContain("references public.paper_accounts_v3(id, user_id)");
    expect(migration).toContain("foreign key (account_id, competition_id)");
  });

  it("keeps competition mutation RPCs service-role only", () => {
    expect(migration).toContain(
      "revoke all on function public.join_paper_competition_v3(uuid,uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.join_paper_competition_v3(uuid,uuid) to service_role",
    );
  });

  it("does not expose direct client writes to competition tables", () => {
    expect(migration).toContain("revoke all on public.paper_competitions_v3 from public, anon, authenticated");
    expect(migration).toContain("revoke all on public.paper_competition_entries_v3 from public, anon, authenticated");
    expect(migration).not.toContain("grant insert");
    expect(migration).not.toContain("grant update");
    expect(migration).not.toContain("grant delete");
  });
});