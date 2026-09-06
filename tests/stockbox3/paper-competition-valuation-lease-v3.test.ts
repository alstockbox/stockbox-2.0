import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260905223900_paper_competition_valuation_lease_v3.sql",
);
const source = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, "utf8") : "";

describe("Paper Trading V3 competition valuation lease/cooldown", () => {
  it("persists exactly one internal valuation-control row per competition and exposes no authenticated table writes", () => {
    expect(source).toContain("create table if not exists public.paper_competition_valuation_control_v3");
    expect(source).toContain("competition_id uuid primary key");
    expect(source).toContain("references public.paper_competitions_v3(id)");
    expect(source).toContain("alter table public.paper_competition_valuation_control_v3 enable row level security");
    expect(source).toContain("revoke all on table public.paper_competition_valuation_control_v3 from public, anon, authenticated");
    expect(source).not.toContain("grant insert on table public.paper_competition_valuation_control_v3 to authenticated");
    expect(source).not.toContain("grant update on table public.paper_competition_valuation_control_v3 to authenticated");
  });

  it("provides a service-role-only security-definer claim RPC with no caller-controlled clock or durations", () => {
    expect(source).toContain("create or replace function public.claim_paper_competition_valuation_v3(");
    expect(source).toContain("p_competition_id uuid");
    expect(source).not.toContain("p_now");
    expect(source).not.toContain("p_cooldown");
    expect(source).not.toContain("p_lease");
    expect(source).toContain("security definer");
    expect(source).toContain("set search_path = ''");
    expect(source).toContain("revoke all on function public.claim_paper_competition_valuation_v3(uuid) from public, anon, authenticated");
    expect(source).toContain("grant execute on function public.claim_paper_competition_valuation_v3(uuid) to service_role");
  });

  it("serializes claims on the competition row before inspecting or creating control state", () => {
    expect(source).toContain("from public.paper_competitions_v3");
    expect(source).toContain("where id = p_competition_id");
    expect(source).toContain("for update");
    const lockIndex = source.indexOf("for update");
    const controlIndex = source.indexOf("paper_competition_valuation_control_v3", lockIndex);
    expect(lockIndex).toBeGreaterThan(-1);
    expect(controlIndex).toBeGreaterThan(lockIndex);
  });

  it("only claims active public challenges inside their official trading window", () => {
    expect(source).toContain("v_competition.kind <> 'challenge'");
    expect(source).toContain("v_competition.status <> 'active'");
    expect(source).toContain("v_now < v_competition.starts_at");
    expect(source).toContain("v_now > v_competition.ends_at");
  });

  it("uses the database clock and enforces a fixed fifteen-minute claim cooldown", () => {
    expect(source).toContain("v_now timestamptz := now()");
    expect(source).toContain("v_control.last_claimed_at > v_now - interval '15 minutes'");
  });

  it("blocks a live lease and issues a database-generated ten-minute lease token only when claimable", () => {
    expect(source).toContain("v_control.lease_expires_at > v_now");
    expect(source).toContain("v_lease_token uuid := gen_random_uuid()");
    expect(source).toContain("v_now + interval '10 minutes'");
    expect(source).toContain("lease_token = v_lease_token");
  });

  it("returns a non-claimed result without provider work when the competition is absent, ineligible, cooling down, or leased", () => {
    expect(source).toContain("return query select false, null::uuid, v_now, null::timestamptz");
    expect(source).toContain("return query select true, v_lease_token, v_now, v_now + interval '10 minutes'");
  });
});
