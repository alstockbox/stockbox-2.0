import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACADEMY_LESSONS_V3, academyLessonCategoriesV3 } from "@/lib/academy/catalog-v3";
import { gradeAcademyQuizV3 } from "@/lib/academy/quiz-v3";
import { deriveInvestorScoreV3 } from "@/lib/academy/investor-score-v3";

const scoreSource = readFileSync("src/lib/academy/investor-score-v3.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260905215000_academy_progress_v3.sql", "utf8");

describe("Academy V3", () => {
  it("ships a complete bilingual core catalog across six learning dimensions", () => {
    expect(ACADEMY_LESSONS_V3).toHaveLength(6);
    expect(academyLessonCategoriesV3()).toHaveLength(6);
    for (const lesson of ACADEMY_LESSONS_V3) {
      expect(lesson.title.sv.trim().length).toBeGreaterThan(0);
      expect(lesson.title.en.trim().length).toBeGreaterThan(0);
      expect(lesson.sections.length).toBeGreaterThan(0);
      expect(lesson.quiz.length).toBeGreaterThanOrEqual(2);
      expect(lesson.passingScore).toBeGreaterThanOrEqual(70);
    }
  });

  it("grades quizzes deterministically from the server answer policy", () => {
    const perfect = gradeAcademyQuizV3("financial-statements-basics", {
      "profit-vs-cash": 1,
      "balance-identity": 0,
    });
    expect(perfect).toMatchObject({ score: 100, correct: 2, total: 2, passed: true });

    const failed = gradeAcademyQuizV3("financial-statements-basics", {
      "profit-vs-cash": 0,
      "balance-identity": 2,
      invented: 99,
    });
    expect(failed).toMatchObject({ score: 0, correct: 0, total: 2, passed: false });
    expect(gradeAcademyQuizV3("unknown-lesson", {})).toBeNull();
  });

  it("starts Investor Score at zero and reaches 100 only with broad mastery", () => {
    const empty = deriveInvestorScoreV3([]);
    expect(empty.score).toBe(0);
    expect(empty.confidence).toBe(0);
    expect(empty.level).toBe("FOUNDATION");

    const complete = deriveInvestorScoreV3(ACADEMY_LESSONS_V3.map((lesson) => ({
      lessonId: lesson.id,
      attempts: 1,
      bestScore: 100,
      passed: true,
    })));
    expect(complete.score).toBe(100);
    expect(complete.knowledgeScore).toBe(100);
    expect(complete.completionScore).toBe(100);
    expect(complete.breadthScore).toBe(100);
    expect(complete.confidence).toBe(100);
    expect(complete.level).toBe("ADVANCED");
  });

  it("does not let one perfect lesson masquerade as broad investor knowledge", () => {
    const first = ACADEMY_LESSONS_V3[0];
    if (!first) throw new Error("academy catalog unexpectedly empty");
    const score = deriveInvestorScoreV3([{ lessonId: first.id, attempts: 1, bestScore: 100, passed: true }]);
    expect(score.score).toBeLessThan(25);
    expect(score.confidence).toBeLessThan(20);
    expect(score.passedLessons).toBe(1);
    expect(score.completedCategories).toBe(1);
  });

  it("is explicitly educational and structurally disconnected from stock recommendations", () => {
    const result = deriveInvestorScoreV3([]);
    expect(result.educationalOnly).toBe(true);
    expect(result.affectsObjectiveRecommendation).toBe(false);
    expect(result.affectsUserMatch).toBe(false);
    expect(scoreSource).toContain("educational progress score only");

    for (const forbidden of [
      "personalizedScore",
      "userMatchScore",
      "stockBoxScore",
      "RecommendationV3",
      "calculateRealizedPortfolioPerformance",
      "PortfolioTransactionInput",
      'from "@/lib/portfolio/',
      'from "@/lib/analysis/recommendation',
      "riskTolerance",
    ]) {
      expect(scoreSource).not.toContain(forbidden);
    }
  });

  it("keeps progress client-read-only and score writes service-role-only", () => {
    expect(migration).toContain("alter table public.academy_progress_v3 enable row level security;");
    expect(migration).toContain("for select to authenticated");
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
    expect(migration).toContain("revoke insert, update, delete on table public.academy_progress_v3 from public, anon, authenticated;");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.record_academy_attempt_v3(uuid,text,numeric,boolean) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.record_academy_attempt_v3(uuid,text,numeric,boolean) to service_role;");
  });
});
