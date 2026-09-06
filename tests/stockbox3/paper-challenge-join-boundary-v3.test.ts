import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905223700_paper_challenge_join_boundary_v3.sql",
);
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8").toLowerCase() : "";
const repositoryPath = path.join(process.cwd(), "src/lib/paper-trading/competition-repository-v3.ts");
const repository = fs.readFileSync(repositoryPath, "utf8");

describe("Paper Trading V3 challenge-only join boundary", () => {
  it("replaces the generic join RPC with an explicit challenge-only guard", () => {
    expect(migration).toContain("create or replace function public.join_paper_competition_v3");
    expect(migration).toContain("if v_competition.kind <> 'challenge'");
    expect(migration).toContain("paper competition requires private league invite");
  });

  it("checks competition kind before returning any existing entry", () => {
    const kindGuard = migration.indexOf("if v_competition.kind <> 'challenge'");
    const entryLookup = migration.indexOf("from public.paper_competition_entries_v3");
    expect(kindGuard).toBeGreaterThanOrEqual(0);
    expect(entryLookup).toBeGreaterThan(kindGuard);
  });

  it("preserves open-window and participant-cap enforcement", () => {
    expect(migration).toContain("v_competition.status <> 'open'");
    expect(migration).toContain("v_competition.join_deadline");
    expect(migration).toContain("v_competition.starts_at");
    expect(migration).toContain("v_participant_count >= v_competition.max_participants");
  });

  it("still creates only a dedicated 100000 competition account and matching cash balance", () => {
    expect(migration).toContain("'competition'");
    expect(migration).toContain("100000");
    expect(migration).toContain("insert into public.paper_cash_balances_v3");
    expect(migration).toContain("insert into public.paper_competition_entries_v3");
  });

  it("keeps the RPC service-role only", () => {
    expect(migration).toContain(
      "revoke all on function public.join_paper_competition_v3(uuid,uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.join_paper_competition_v3(uuid,uuid) to service_role",
    );
  });

  it("keeps the server repository join payload limited to normalized user and competition identity", () => {
    expect(repository).toContain('.rpc("join_paper_competition_v3"');
    expect(repository).toContain("p_user_id: normalizedUserId");
    expect(repository).toContain("p_competition_id: normalizedCompetitionId");
    expect(repository).not.toContain("p_invite_token");
    expect(repository).not.toContain("p_starting_cash");
    expect(repository).not.toContain("p_base_currency");
  });
});
