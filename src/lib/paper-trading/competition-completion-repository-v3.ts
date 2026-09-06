import { createAdminClient } from "@/lib/supabase/admin";

export type PaperCompetitionCompletionResultV3 =
  | { ok: true; completed: number }
  | {
      ok: false;
      error:
        | "SUPABASE_ADMIN_NOT_CONFIGURED"
        | "PAPER_COMPETITION_COMPLETION_INVALID_RESULT"
        | "PAPER_COMPETITION_COMPLETION_FAILED";
    };

export async function completeDuePaperCompetitionsV3(): Promise<PaperCompetitionCompletionResultV3> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("complete_due_paper_competitions_v3");
    if (error) return { ok: false, error: "PAPER_COMPETITION_COMPLETION_FAILED" };

    const completed = typeof data === "number"
      ? data
      : typeof data === "string" && data.trim()
        ? Number(data)
        : Number.NaN;
    const validCompleted = Number.isInteger(completed) && completed >= 0;
    if (!validCompleted) {
      return { ok: false, error: "PAPER_COMPETITION_COMPLETION_INVALID_RESULT" };
    }

    return { ok: true, completed };
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_COMPLETION_FAILED" };
  }
}
