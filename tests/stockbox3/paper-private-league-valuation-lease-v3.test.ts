import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905224300_paper_private_league_valuation_claim_v3.sql",
);
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";
const repository = fs.readFileSync(
  path.join(process.cwd(), "src/lib/paper-trading/valuation-lease-repository-v3.ts"),
  "utf8",
);

function functionBlock(source: string, signature: string, nextSignature?: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  if (!nextSignature) return source.slice(start);
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end >= 0 ? end : source.length);
}

const challengeAdapter = functionBlock(
  repository,
  "export async function claimPaperCompetitionValuationV3(",
  "export async function claimPrivatePaperLeagueValuationV3(",
);
const privateAdapter = functionBlock(
  repository,
  "export async function claimPrivatePaperLeagueValuationV3(",
  "export async function completePaperCompetitionValuationV3(",
);

describe("Paper Trading V3 private league valuation lease", () => {
  it("adds a separate service-role-only private-league claim RPC without replacing the challenge RPC", () => {
    expect(migration).toContain("create or replace function public.claim_private_paper_league_valuation_v3(");
    expect(migration).toContain("p_competition_id uuid");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "revoke all on function public.claim_private_paper_league_valuation_v3(uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.claim_private_paper_league_valuation_v3(uuid) to service_role",
    );
    expect(migration).not.toContain("create or replace function public.claim_paper_competition_valuation_v3(");
  });

  it("keeps all valuation timing authority in the database and accepts no caller-controlled clock, kind, cooldown or lease duration", () => {
    expect(migration).not.toContain("p_now");
    expect(migration).not.toContain("p_kind");
    expect(migration).not.toContain("p_cooldown");
    expect(migration).not.toContain("p_lease_duration");
    expect(migration).toContain("v_now timestamptz := now()");
    expect(migration).toContain("v_now := clock_timestamp()");
  });

  it("serializes on the competition row before reading or writing shared valuation-control state", () => {
    expect(migration).toContain("from public.paper_competitions_v3");
    expect(migration).toContain("where id = p_competition_id");
    expect(migration).toContain("for update");
    const lockIndex = migration.indexOf("for update");
    const controlIndex = migration.indexOf("paper_competition_valuation_control_v3", lockIndex);
    expect(lockIndex).toBeGreaterThan(-1);
    expect(controlIndex).toBeGreaterThan(lockIndex);
  });

  it("claims only active private leagues inside their official trading window", () => {
    expect(migration).toContain("v_competition.kind <> 'private_league'");
    expect(migration).toContain("v_competition.status <> 'active'");
    expect(migration).toContain("v_now < v_competition.starts_at");
    expect(migration).toContain("v_now > v_competition.ends_at");
  });

  it("shares the existing valuation-control row, fifteen-minute cooldown and ten-minute database lease semantics", () => {
    expect(migration).toContain("public.paper_competition_valuation_control_v3");
    expect(migration).toContain("v_control.last_claimed_at > v_now - interval '15 minutes'");
    expect(migration).toContain("v_control.lease_expires_at > v_now");
    expect(migration).toContain("v_lease_token uuid := gen_random_uuid()");
    expect(migration).toContain("v_now + interval '10 minutes'");
    expect(migration).toContain("lease_token = v_lease_token");
    expect(migration).toContain("return query select false, null::uuid, v_now, null::timestamptz");
    expect(migration).toContain("return query select true, v_lease_token, v_now, v_now + interval '10 minutes'");
  });

  it("adds a strict repository adapter for the private RPC while leaving the challenge adapter on its original RPC", () => {
    expect(repository).toContain("export async function claimPrivatePaperLeagueValuationV3(");
    expect(privateAdapter).toContain('supabase.rpc("claim_private_paper_league_valuation_v3"');
    expect(challengeAdapter).toContain('supabase.rpc("claim_paper_competition_valuation_v3"');
    expect(challengeAdapter).not.toContain("claim_private_paper_league_valuation_v3");
  });

  it("keeps both repository claim adapters competition-id-only and validates the same strict lease result shape", () => {
    expect(privateAdapter).toContain("competitionIdInput: string");
    expect(privateAdapter).not.toContain("serverNow");
    expect(privateAdapter).not.toContain("cooldown");
    expect(privateAdapter).not.toContain("leaseDuration");
    expect(privateAdapter).not.toContain("kind:");
    expect(privateAdapter).toContain("PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT");
    expect(privateAdapter).toContain("UUID_PATTERN.test(leaseToken)");
    expect(privateAdapter).toContain("Date.parse(leaseExpiresAt) > Date.parse(claimedAt)");
  });
});
