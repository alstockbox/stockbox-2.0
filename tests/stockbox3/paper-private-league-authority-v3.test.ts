import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905224200_paper_private_league_authority_v3.sql",
);
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8").toLowerCase() : "";
const challengeJoinPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905223700_paper_challenge_join_boundary_v3.sql",
);
const challengeJoin = fs.readFileSync(challengeJoinPath, "utf8").toLowerCase();

describe("Paper Trading V3 private league authority", () => {
  it("keeps the generic competition join challenge-only", () => {
    expect(challengeJoin).toContain("if v_competition.kind <> 'challenge'");
    expect(challengeJoin).toContain("paper competition requires private league invite");
    expect(migration).not.toContain("create or replace function public.join_paper_competition_v3");
  });

  it("stores only hashed invite material and never a reusable raw invite token", () => {
    expect(migration).toContain("create table if not exists public.paper_private_league_invites_v3");
    expect(migration).toContain("invite_token_hash text not null");
    expect(migration).toContain("invite_token_hash ~ '^[0-9a-f]{64}$'");
    expect(migration).not.toMatch(/\binvite_token\s+text/);
    expect(migration).not.toMatch(/\braw_token\b/);
  });

  it("models private league member roles without making private leagues publicly enumerable", () => {
    expect(migration).toContain("create table if not exists public.paper_private_league_members_v3");
    expect(migration).toContain("role text not null");
    expect(migration).toContain("role in ('owner', 'admin', 'member')");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.paper_private_league_invites_v3 from public, anon, authenticated");
    expect(migration).toContain("revoke all on public.paper_private_league_members_v3 from public, anon, authenticated");
    expect(migration).not.toContain("grant select on public.paper_private_league_invites_v3 to authenticated");
  });

  it("creates a private league with exactly one owner competition account at fixed starting capital", () => {
    expect(migration).toContain("create or replace function public.create_private_paper_league_v3");
    expect(migration).toContain("'private_league'");
    expect(migration).toContain("100000");
    expect(migration).toContain("'competition'");
    expect(migration).toContain("insert into public.paper_cash_balances_v3");
    expect(migration).toContain("insert into public.paper_competition_entries_v3");
    expect(migration).toContain("insert into public.paper_private_league_members_v3");
    expect(migration).toContain("'owner'");
  });

  it("joins private leagues only through a separate hashed-invite RPC with expiry and revocation checks", () => {
    expect(migration).toContain("create or replace function public.join_private_paper_league_v3");
    expect(migration).toContain("p_invite_token_hash text");
    expect(migration).toContain("where invite_token_hash = v_invite_token_hash");
    expect(migration).toContain("v_invite.revoked_at is not null");
    expect(migration).toContain("v_invite.expires_at <= v_now");
    expect(migration).toContain("v_competition.kind <> 'private_league'");
  });

  it("serializes private league joins before participant counting and remains retry-idempotent", () => {
    const joinStart = migration.indexOf("create or replace function public.join_private_paper_league_v3");
    const inviteLock = migration.indexOf("for update", joinStart);
    const competitionLookup = migration.indexOf("from public.paper_competitions_v3", inviteLock);
    const competitionLock = migration.indexOf("for update", competitionLookup);
    const existingEntry = migration.indexOf("from public.paper_competition_entries_v3", competitionLock);
    const existingReturn = migration.indexOf("if found then", existingEntry);
    const participantCount = migration.indexOf("select count(*)::integer into v_participant_count", existingReturn);
    const participantCap = migration.indexOf("v_participant_count >= v_competition.max_participants", participantCount);
    const accountInsert = migration.indexOf("insert into public.paper_accounts_v3", participantCap);

    expect(joinStart).toBeGreaterThanOrEqual(0);
    expect(inviteLock).toBeGreaterThan(joinStart);
    expect(competitionLookup).toBeGreaterThan(inviteLock);
    expect(competitionLock).toBeGreaterThan(competitionLookup);
    expect(existingEntry).toBeGreaterThan(competitionLock);
    expect(existingReturn).toBeGreaterThan(existingEntry);
    expect(participantCount).toBeGreaterThan(existingReturn);
    expect(participantCap).toBeGreaterThan(participantCount);
    expect(accountInsert).toBeGreaterThan(participantCap);
  });

  it("gives only owner/admin authority to create or revoke invite hashes", () => {
    expect(migration).toContain("create or replace function public.create_private_paper_league_invite_v3");
    expect(migration).toContain("create or replace function public.revoke_private_paper_league_invite_v3");
    expect(migration).toContain("v_actor_role not in ('owner', 'admin')");
    expect(migration).toContain("set revoked_at = v_now");
  });

  it("lets only the owner promote or demote existing league members and never reassigns ownership", () => {
    expect(migration).toContain("create or replace function public.set_private_paper_league_member_role_v3");
    expect(migration).toContain("v_actor_role <> 'owner'");
    expect(migration).toContain("p_role not in ('admin', 'member')");
    expect(migration).toContain("target private league member unavailable");
  });

  it("keeps every private league write RPC service-role only and search-path hardened", () => {
    const rpcNames = [
      "create_private_paper_league_v3",
      "join_private_paper_league_v3",
      "create_private_paper_league_invite_v3",
      "revoke_private_paper_league_invite_v3",
      "set_private_paper_league_member_role_v3",
    ];
    expect(migration.split("security definer").length - 1).toBeGreaterThanOrEqual(rpcNames.length);
    expect(migration.split("set search_path = ''").length - 1).toBeGreaterThanOrEqual(rpcNames.length);
    for (const rpcName of rpcNames) {
      expect(migration).toContain(`revoke all on function public.${rpcName}`);
      expect(migration).toContain(`grant execute on function public.${rpcName}`);
      expect(migration).toContain("to service_role");
    }
  });
});