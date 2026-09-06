import { createAdminClient } from "@/lib/supabase/admin";

export type PaperCompetitionLifecycleReconcileResultV3 =
  | { ok: true; activated: number }
  | { ok: false; error: string };

export async function reconcilePaperCompetitionLifecycleV3(): Promise<PaperCompetitionLifecycleReconcileResultV3> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };
  }

  try {
    const { data, error } = await supabase.rpc("reconcile_paper_competition_lifecycle_v3");
    if (error) return { ok: false, error: error.message };

    const activated = typeof data === "number"
      ? data
      : typeof data === "string" && data.trim()
        ? Number(data)
        : Number.NaN;
    const validActivated = Number.isInteger(activated) && activated >= 0;
    if (!validActivated) {
      return { ok: false, error: "PAPER_COMPETITION_LIFECYCLE_INVALID_RESULT" };
    }

    return { ok: true, activated };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "PAPER_COMPETITION_LIFECYCLE_FAILED",
    };
  }
}
