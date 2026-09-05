import { createAdminClient } from "@/lib/supabase/admin";
import type { AcademyProgressInputV3 } from "./investor-score-v3";

export type AcademyProgressRowV3 = {
  lesson_id: string;
  attempts: number;
  best_score: number;
  passed: boolean;
  completed_at: string | null;
  last_attempt_at: string | null;
};

export type AcademyProgressLoadResultV3 =
  | { ok: true; progress: AcademyProgressRowV3[] }
  | { ok: false; error: string; progress: [] };

export async function loadAcademyProgressV3(userId: string): Promise<AcademyProgressLoadResultV3> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED", progress: [] };

  try {
    const { data, error } = await supabase
      .from("academy_progress_v3")
      .select("lesson_id,attempts,best_score,passed,completed_at,last_attempt_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) return { ok: false, error: error.message, progress: [] };
    const progress = (data ?? []).map((row) => ({
      lesson_id: String(row.lesson_id),
      attempts: Number(row.attempts ?? 0),
      best_score: Number(row.best_score ?? 0),
      passed: Boolean(row.passed),
      completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
      last_attempt_at: typeof row.last_attempt_at === "string" ? row.last_attempt_at : null,
    }));
    return { ok: true, progress };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ACADEMY_PROGRESS_LOAD_FAILED", progress: [] };
  }
}

export function toInvestorScoreProgressV3(progress: readonly AcademyProgressRowV3[]): AcademyProgressInputV3[] {
  return progress.map((row) => ({
    lessonId: row.lesson_id,
    attempts: row.attempts,
    bestScore: row.best_score,
    passed: row.passed,
  }));
}

export type AcademyAttemptPersistResultV3 =
  | { ok: true }
  | { ok: false; error: string };

export async function persistAcademyAttemptV3(input: {
  userId: string;
  lessonId: string;
  score: number;
  passed: boolean;
}): Promise<AcademyAttemptPersistResultV3> {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { error } = await supabase.rpc("record_academy_attempt_v3", {
      p_user_id: input.userId,
      p_lesson_id: input.lessonId,
      p_score: input.score,
      p_passed: input.passed,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "ACADEMY_PROGRESS_WRITE_FAILED" };
  }
}
