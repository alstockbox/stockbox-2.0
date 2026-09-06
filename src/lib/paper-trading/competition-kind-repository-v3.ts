import { createAdminClient } from "@/lib/supabase/admin";

export type PaperCompetitionKindV3 = "challenge" | "private_league";

export type PaperCompetitionKindResultV3 =
  | { ok: true; kind: PaperCompetitionKindV3 }
  | {
      ok: false;
      error:
        | "PAPER_COMPETITION_KIND_INVALID_INPUT"
        | "PAPER_COMPETITION_KIND_NOT_FOUND"
        | "PAPER_COMPETITION_KIND_INVALID_RESULT"
        | "PAPER_COMPETITION_KIND_LOOKUP_FAILED"
        | "SUPABASE_ADMIN_NOT_CONFIGURED";
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Reads only the server-owned competition kind needed for internal valuation
 * dispatch. This is intentionally not a discovery/listing API and never
 * accepts user, account, timing or valuation authority from the caller.
 */
export async function loadPaperCompetitionKindV3(
  competitionIdInput: string,
): Promise<PaperCompetitionKindResultV3> {
  const competitionId = competitionIdInput.trim();
  if (!UUID_PATTERN.test(competitionId)) {
    return { ok: false, error: "PAPER_COMPETITION_KIND_INVALID_INPUT" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase
      .from("paper_competitions_v3")
      .select("id,kind")
      .eq("id", competitionId)
      .maybeSingle();

    if (error) return { ok: false, error: "PAPER_COMPETITION_KIND_LOOKUP_FAILED" };
    if (!data) return { ok: false, error: "PAPER_COMPETITION_KIND_NOT_FOUND" };

    const row = data as Record<string, unknown>;
    if (row.id !== competitionId || (row.kind !== "challenge" && row.kind !== "private_league")) {
      return { ok: false, error: "PAPER_COMPETITION_KIND_INVALID_RESULT" };
    }

    return { ok: true, kind: row.kind };
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_KIND_LOOKUP_FAILED" };
  }
}
