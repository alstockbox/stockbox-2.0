import { ACADEMY_LESSONS_V3, academyLessonCategoriesV3 } from "./catalog-v3";

export const INVESTOR_SCORE_V3_POLICY_VERSION = "stockbox-investor-score-v3.0.0";

export type AcademyProgressInputV3 = {
  lessonId: string;
  attempts: number;
  bestScore: number;
  passed: boolean;
};

export type InvestorScoreV3 = {
  score: number;
  knowledgeScore: number;
  completionScore: number;
  breadthScore: number;
  attemptedLessons: number;
  passedLessons: number;
  totalLessons: number;
  completedCategories: number;
  totalCategories: number;
  confidence: number;
  level: "FOUNDATION" | "DEVELOPING" | "ESTABLISHED" | "ADVANCED";
  policyVersion: string;
  educationalOnly: true;
  affectsObjectiveRecommendation: false;
  affectsUserMatch: false;
};

function bounded(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function levelFor(score: number): InvestorScoreV3["level"] {
  if (score >= 85) return "ADVANCED";
  if (score >= 65) return "ESTABLISHED";
  if (score >= 35) return "DEVELOPING";
  return "FOUNDATION";
}

/**
 * Investor Score V3 is an educational progress score only. It intentionally
 * excludes portfolio returns, trading P/L, wealth, risk tolerance, User Match,
 * StockBox stock ratings and recommendation outcomes.
 */
export function deriveInvestorScoreV3(progress: readonly AcademyProgressInputV3[]): InvestorScoreV3 {
  const lessonIds = new Set(ACADEMY_LESSONS_V3.map((lesson) => lesson.id));
  const normalized = new Map<string, AcademyProgressInputV3>();

  for (const item of progress) {
    if (!lessonIds.has(item.lessonId)) continue;
    const existing = normalized.get(item.lessonId);
    const candidate: AcademyProgressInputV3 = {
      lessonId: item.lessonId,
      attempts: Math.max(0, Math.floor(Number.isFinite(item.attempts) ? item.attempts : 0)),
      bestScore: bounded(item.bestScore),
      passed: Boolean(item.passed),
    };
    if (!existing || candidate.bestScore > existing.bestScore || candidate.attempts > existing.attempts) {
      normalized.set(item.lessonId, {
        lessonId: item.lessonId,
        attempts: Math.max(existing?.attempts ?? 0, candidate.attempts),
        bestScore: Math.max(existing?.bestScore ?? 0, candidate.bestScore),
        passed: Boolean(existing?.passed || candidate.passed),
      });
    }
  }

  const totalLessons = ACADEMY_LESSONS_V3.length;
  const attemptedLessons = [...normalized.values()].filter((item) => item.attempts > 0).length;
  const passedLessons = [...normalized.values()].filter((item) => item.passed).length;
  const knowledgeScore = totalLessons > 0
    ? ACADEMY_LESSONS_V3.reduce((sum, lesson) => sum + (normalized.get(lesson.id)?.bestScore ?? 0), 0) / totalLessons
    : 0;
  const completionScore = totalLessons > 0 ? (passedLessons / totalLessons) * 100 : 0;

  const categories = academyLessonCategoriesV3();
  const completedCategorySet = new Set(
    ACADEMY_LESSONS_V3
      .filter((lesson) => normalized.get(lesson.id)?.passed)
      .map((lesson) => lesson.category),
  );
  const totalCategories = categories.length;
  const completedCategories = completedCategorySet.size;
  const breadthScore = totalCategories > 0 ? (completedCategories / totalCategories) * 100 : 0;

  const score = bounded((knowledgeScore * 0.55) + (completionScore * 0.30) + (breadthScore * 0.15));
  const confidence = totalLessons > 0 ? bounded((attemptedLessons / totalLessons) * 100) : 0;
  const roundedScore = Math.round(score * 10) / 10;

  return {
    score: roundedScore,
    knowledgeScore: Math.round(knowledgeScore * 10) / 10,
    completionScore: Math.round(completionScore * 10) / 10,
    breadthScore: Math.round(breadthScore * 10) / 10,
    attemptedLessons,
    passedLessons,
    totalLessons,
    completedCategories,
    totalCategories,
    confidence: Math.round(confidence * 10) / 10,
    level: levelFor(roundedScore),
    policyVersion: INVESTOR_SCORE_V3_POLICY_VERSION,
    educationalOnly: true,
    affectsObjectiveRecommendation: false,
    affectsUserMatch: false,
  };
}
