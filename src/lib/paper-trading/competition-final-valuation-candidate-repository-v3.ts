import { createAdminClient } from "@/lib/supabase/admin";

export const PAPER_COMPETITION_FINAL_VALUATION_SWEEP_LIMIT_V3 = 8;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RPC_NAME = "list_due_paper_competition_final_valuations_v3";

export type PaperCompetitionFinalValuationCandidatesResultV3 =
  | { ok: true; competitionIds: string[] }
  | {
      ok: false;
      error:
        | "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_LOOKUP_FAILED"
        | "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_INVALID_RESULT";
    };

type CandidateRpcV3 = (name: string) => PromiseLike<{ data: unknown; error: unknown }>;

type PaperCompetitionFinalValuationCandidateRepositoryDependenciesV3 = {
  rpc: CandidateRpcV3;
};

async function defaultCandidateRpc(name: string): Promise<{ data: unknown; error: unknown }> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { data: null, error: new Error("Supabase admin unavailable") };
  }
  const { data, error } = await supabase.rpc(name);
  return { data, error };
}

/**
 * Loads only DB-selected completed competitions that may need an exact endsAt
 * final valuation. The database owns timing, final-verification, cooldown and
 * lease eligibility; the downstream final-claim RPC remains final authority.
 */
export async function loadDuePaperCompetitionFinalValuationCandidatesV3(
  dependencies: PaperCompetitionFinalValuationCandidateRepositoryDependenciesV3 = {
    rpc: defaultCandidateRpc,
  },
): Promise<PaperCompetitionFinalValuationCandidatesResultV3> {
  let response: { data: unknown; error: unknown };
  try {
    response = await dependencies.rpc(RPC_NAME);
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_LOOKUP_FAILED" };
  }

  if (response.error) {
    return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_LOOKUP_FAILED" };
  }
  if (!Array.isArray(response.data) || response.data.length > PAPER_COMPETITION_FINAL_VALUATION_SWEEP_LIMIT_V3) {
    return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_INVALID_RESULT" };
  }

  const competitionIds: string[] = [];
  const seen = new Set<string>();
  for (const raw of response.data) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_INVALID_RESULT" };
    }
    const id = (raw as Record<string, unknown>).competition_id;
    if (typeof id !== "string" || !UUID_PATTERN.test(id) || seen.has(id)) {
      return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CANDIDATES_INVALID_RESULT" };
    }
    seen.add(id);
    competitionIds.push(id);
  }

  return { ok: true, competitionIds };
}
