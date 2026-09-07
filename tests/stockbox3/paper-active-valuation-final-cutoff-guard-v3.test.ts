import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260907143500_paper_active_valuation_final_cutoff_guard_v3.sql";

function functionBlock(source: string, signature: string, nextSignature?: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  if (!nextSignature) return source.slice(start);
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end >= 0 ? end : source.length);
}

describe("Paper Trading V3 active valuation final-cutoff guard", () => {
  it("reserves exact endsAt for the historical final pipeline for both challenge and private-league active claims", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    const challenge = functionBlock(
      sql,
      "create or replace function public.claim_paper_competition_valuation_v3(",
      "create or replace function public.claim_private_paper_league_valuation_v3(",
    );
    const privateLeague = functionBlock(
      sql,
      "create or replace function public.claim_private_paper_league_valuation_v3(",
    );

    expect(challenge).toContain("v_competition.kind <> 'challenge'");
    expect(privateLeague).toContain("v_competition.kind <> 'private_league'");
    for (const block of [challenge, privateLeague]) {
      expect(block).toContain("v_competition.status <> 'active'");
      expect(block).toContain("v_now < v_competition.starts_at");
      expect(block).toContain("v_now >= v_competition.ends_at");
      expect(block).toContain("clock_timestamp()");
      expect(block).toContain("for update");
      expect(block).not.toContain("v_now > v_competition.ends_at");
      expect(block).not.toContain("p_now");
      expect(block).not.toContain("p_cutoff");
    }

    expect(sql).not.toContain("claim_final_paper_competition_valuation_v3");
  });
});
