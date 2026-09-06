import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  PAPER_COMPETITION_FINAL_VALUATION_SWEEP_LIMIT_V3,
  loadDuePaperCompetitionFinalValuationCandidatesV3,
} from "../../src/lib/paper-trading/competition-final-valuation-candidate-repository-v3";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const migrationPath = "supabase/migrations/20260905224800_paper_competition_final_valuation_candidates_v3.sql";

describe("Paper Trading V3 final valuation candidate authority", () => {
  it("defines a bounded service-role-only DB candidate function for completed competitions missing an exact final", () => {
    expect(PAPER_COMPETITION_FINAL_VALUATION_SWEEP_LIMIT_V3).toBe(8);
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("list_due_paper_competition_final_valuations_v3()");
    expect(sql).toContain("clock_timestamp()");
    expect(sql).toContain("left join public.paper_competition_valuation_control_v3");
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("kind in ('challenge', 'private_league')");
    expect(sql).toContain("v_now > c.ends_at");
    expect(sql).toContain("last_verified_evaluation_cutoff is distinct from c.ends_at");
    expect(sql).toContain("lease_expires_at");
    expect(sql).toContain("last_evaluation_cutoff");
    expect(sql).toContain("last_completed_at");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("order by c.ends_at asc, c.id asc");
    expect(sql).toContain("limit 8");
    expect(sql).toContain("revoke all on function public.list_due_paper_competition_final_valuations_v3() from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.list_due_paper_competition_final_valuations_v3() to service_role");
    expect(sql).not.toContain("p_now");
    expect(sql).not.toContain("p_limit");
    expect(sql).not.toContain("p_cutoff");
    expect(sql).not.toContain("p_kind");
    expect(sql).not.toContain("p_user");
    expect(sql).not.toContain("p_account");
  });

  it("calls exactly one no-argument trusted RPC and accepts only unique bounded UUID rows", async () => {
    const validRpc = vi.fn(async () => ({ data: [{ competition_id: A }, { competition_id: B }], error: null }));

    expect(await loadDuePaperCompetitionFinalValuationCandidatesV3({ rpc: validRpc })).toEqual({
      ok: true,
      competitionIds: [A, B],
    });
    expect(validRpc).toHaveBeenCalledTimes(1);
    expect(validRpc).toHaveBeenCalledWith("list_due_paper_competition_final_valuations_v3");
  });

  it("fails closed on malformed, duplicate, oversized or failed candidate results", async () => {
    for (const data of [
      null,
      [{ competition_id: "bad" }],
      [{ competition_id: A }, { competition_id: A }],
      Array.from({ length: 9 }, (_, index) => ({
        competition_id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      })),
    ]) {
      const rpc = vi.fn(async () => ({ data, error: null }));
      expect(await loadDuePaperCompetitionFinalValuationCandidatesV3({ rpc })).toEqual({
        ok: false,
        error: "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_INVALID_RESULT",
      });
    }

    const failedRpc = vi.fn(async () => ({ data: null, error: { message: "db unavailable" } }));
    expect(await loadDuePaperCompetitionFinalValuationCandidatesV3({ rpc: failedRpc })).toEqual({
      ok: false,
      error: "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_LOOKUP_FAILED",
    });
  });
});
