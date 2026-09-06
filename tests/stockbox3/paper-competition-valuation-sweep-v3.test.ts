import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  PAPER_COMPETITION_VALUATION_SWEEP_LIMIT_V3,
  loadDuePaperCompetitionValuationCandidatesV3,
} from "../../src/lib/paper-trading/competition-valuation-candidate-repository-v3";
import { runPaperCompetitionValuationSweepV3 } from "../../src/lib/paper-trading/competition-valuation-sweep-v3";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const migrationPath = "supabase/migrations/20260905224400_paper_competition_valuation_candidates_v3.sql";

describe("Paper Trading V3 bounded competition valuation sweep", () => {
  it("defines a service-role-only DB candidate function with a fixed starvation-resistant bound", () => {
    expect(PAPER_COMPETITION_VALUATION_SWEEP_LIMIT_V3).toBe(8);
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("list_due_paper_competition_valuations_v3()");
    expect(sql).toContain("clock_timestamp()");
    expect(sql).toContain("left join public.paper_competition_valuation_control_v3");
    expect(sql).toContain("interval '15 minutes'");
    expect(sql).toContain("lease_expires_at");
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("row_number() over");
    expect(sql).toContain("partition by c.kind");
    expect(sql).toContain("nulls first");
    expect(sql).toContain("limit 8");
    expect(sql).toContain("revoke all on function public.list_due_paper_competition_valuations_v3() from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.list_due_paper_competition_valuations_v3() to service_role");
    expect(sql).not.toContain("p_now");
    expect(sql).not.toContain("p_limit");
    expect(sql).not.toContain("p_cutoff");
  });

  it("fails closed on malformed, duplicate or oversized candidate results", async () => {
    const validRpc = vi.fn(async () => ({ data: [{ competition_id: A }, { competition_id: B }], error: null }));
    expect(await loadDuePaperCompetitionValuationCandidatesV3({ rpc: validRpc })).toEqual({
      ok: true,
      competitionIds: [A, B],
    });
    expect(validRpc).toHaveBeenCalledWith("list_due_paper_competition_valuations_v3");

    for (const data of [
      null,
      [{ competition_id: "bad" }],
      [{ competition_id: A }, { competition_id: A }],
      Array.from({ length: 9 }, (_, index) => ({
        competition_id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      })),
    ]) {
      const rpc = vi.fn(async () => ({ data, error: null }));
      expect(await loadDuePaperCompetitionValuationCandidatesV3({ rpc })).toEqual({
        ok: false,
        error: "PAPER_COMPETITION_VALUATION_CANDIDATES_INVALID_RESULT",
      });
    }
  });

  it("fails closed when candidate enumeration fails", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "db unavailable" } }));
    expect(await loadDuePaperCompetitionValuationCandidatesV3({ rpc })).toEqual({
      ok: false,
      error: "PAPER_COMPETITION_VALUATION_CANDIDATES_LOOKUP_FAILED",
    });
  });

  it("runs only the bounded trusted candidate ids and returns aggregate status without ids", async () => {
    const loadCandidates = vi.fn(async () => ({ ok: true as const, competitionIds: [A, B] }));
    const runCompetition = vi
      .fn()
      .mockResolvedValueOnce({ status: "VERIFIED" as const, competitionId: A, evaluationCutoff: "2026-09-06T19:00:00.000Z", participantCount: 2, rankedCount: 2, baseCurrency: "USD" })
      .mockResolvedValueOnce({ status: "UNAVAILABLE" as const, reason: "EVIDENCE_UNAVAILABLE" as const });

    const result = await runPaperCompetitionValuationSweepV3({ loadCandidates, runCompetition });

    expect(runCompetition).toHaveBeenNthCalledWith(1, { competitionId: A });
    expect(runCompetition).toHaveBeenNthCalledWith(2, { competitionId: B });
    expect(result).toEqual({
      status: "COMPLETED",
      attempted: 2,
      verified: 1,
      unavailable: 1,
      throttled: 0,
      disabled: 0,
      killed: 0,
      errors: 0,
    });
    expect(JSON.stringify(result)).not.toContain(A);
    expect(JSON.stringify(result)).not.toContain(B);
  });

  it("continues after one competition error and counts thrown runners as errors", async () => {
    const loadCandidates = vi.fn(async () => ({ ok: true as const, competitionIds: [A, B] }));
    const runCompetition = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ status: "THROTTLED" as const });

    expect(await runPaperCompetitionValuationSweepV3({ loadCandidates, runCompetition })).toEqual({
      status: "COMPLETED",
      attempted: 2,
      verified: 0,
      unavailable: 0,
      throttled: 1,
      disabled: 0,
      killed: 0,
      errors: 1,
    });
    expect(runCompetition).toHaveBeenCalledTimes(2);
  });

  it("fails closed before execution when trusted candidate enumeration is unavailable", async () => {
    const runCompetition = vi.fn();
    expect(await runPaperCompetitionValuationSweepV3({
      loadCandidates: async () => ({ ok: false as const, error: "PAPER_COMPETITION_VALUATION_CANDIDATES_LOOKUP_FAILED" as const }),
      runCompetition,
    })).toEqual({ status: "ERROR" });
    expect(runCompetition).not.toHaveBeenCalled();
  });
});
