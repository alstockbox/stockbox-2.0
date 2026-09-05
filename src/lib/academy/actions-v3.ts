"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getAcademyLessonV3 } from "./catalog-v3";
import { persistAcademyAttemptV3 } from "./progress-repository-v3";
import { gradeAcademyQuizV3 } from "./quiz-v3";

export async function submitAcademyQuizV3Action(formData: FormData) {
  if (!isFeatureEnabled("academy")) redirect("/dashboard");
  const user = await requireUser();
  const lessonIdValue = formData.get("lessonId");
  const lessonId = typeof lessonIdValue === "string" ? lessonIdValue.trim() : "";
  const lesson = getAcademyLessonV3(lessonId);
  if (!lesson) redirect("/academy?error=lesson");

  const answers: Record<string, number | null> = {};
  for (const question of lesson.quiz) {
    const raw = formData.get(`answer:${question.id}`);
    if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
      answers[question.id] = null;
      continue;
    }
    const selected = Number(raw);
    answers[question.id] = Number.isInteger(selected) && selected >= 0 && selected < question.options.length
      ? selected
      : null;
  }

  const grade = gradeAcademyQuizV3(lesson.id, answers);
  if (!grade) redirect("/academy?error=quiz");
  const persisted = await persistAcademyAttemptV3({
    userId: user.id,
    lessonId: lesson.id,
    score: grade.score,
    passed: grade.passed,
  });
  if (!persisted.ok) redirect(`/academy/${lesson.id}?error=save`);

  revalidatePath("/academy");
  revalidatePath(`/academy/${lesson.id}`);
  redirect(`/academy/${lesson.id}?result=recorded`);
}
