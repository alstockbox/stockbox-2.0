import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905224700_paper_competition_final_valuation_claim_v3.sql",
);
const repositoryPath = path.join(
  process.cwd(),
  "src/lib/paper-trading/valuation-lease-repository-v3.ts",
);
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8").toLowerCase() : "";
const repository = fs.readFileSync(repositoryPath, "utf8");

describe("Paper Trading V3 final competition valuation claim authority", () => {
  it("defines a service-role-only claim whose final cutoff is DB-owned competition ends_at", () => {
    expect(migration).toContain("create or replace function public.claim_final_paper_competition_valuation_v3(");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("v_now timestamptz := clock_timestamp()");
    expect(migration).toContain("v_competition.ends_at");
    expect(migration).toContain("revoke all on function public.claim_final_paper_competition_valuation_v3(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.claim_final_paper_competition_valuation_v3(uuid) to service_role");
    expect(migration).not.toContain("p_now");
    expect(migration).not.toContain("p_cutoff");
    expect(migration).not.toContain("p_kind");
  });

  it("claims only completed challenge/private competitions after their official end", () => {
    expect(migration).toContain("v_competition.status <> 'completed'");
    expect(migration).toContain("v_competition.kind not in ('challenge', 'private_league')");
    expect(migration).toContain("v_now <= v_competition.ends_at");
    expect(migration).toContain("for update");
  });

  it("does not reclaim an already verified exact final cutoff", () => {
    expect(migration).toContain("v_control.last_verified_evaluation_cutoff = v_competition.ends_at");
    expect(migration).toContain("return query select false");
  });

  it("serializes leases and throttles repeated completed final attempts by DB completion time", () => {
    expect(migration).toContain("v_control.lease_expires_at > v_now");
    expect(migration).toContain("v_control.last_evaluation_cutoff = v_competition.ends_at");
    expect(migration).toContain("v_control.last_completed_at > v_now - interval '15 minutes'");
    expect(migration).toContain("v_now + interval '10 minutes'");
  });

  it("stores ends_at as the claimed evaluation cutoff while lease expiry remains based on DB now", () => {
    expect(migration).toContain("last_claimed_at,");
    expect(migration).toContain("v_competition.ends_at,");
    expect(migration).toContain("set last_claimed_at = v_competition.ends_at");
    expect(migration).toContain("lease_expires_at = v_now + interval '10 minutes'");
    expect(migration).toContain("select true, v_lease_token, v_competition.ends_at, v_now + interval '10 minutes'");
  });

  it("exposes a strict server repository that accepts only competition id authority", () => {
    expect(repository).toContain("export async function claimFinalPaperCompetitionValuationV3");
    expect(repository).toContain('.rpc("claim_final_paper_competition_valuation_v3", {');
    expect(repository).toContain("p_competition_id: competitionId");
    expect(repository).not.toContain("p_final_cutoff");
    expect(repository).toContain("PAPER_COMPETITION_FINAL_VALUATION_CLAIM_INVALID_RESULT");
  });
});
