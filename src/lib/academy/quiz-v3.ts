import { getAcademyLessonV3 } from "./catalog-v3";

export const ACADEMY_V3_QUIZ_POLICY_VERSION = "stockbox-academy-quiz-v3.0.0";

const ANSWER_KEY_V3: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "financial-statements-basics": {
    "profit-vs-cash": 1,
    "balance-identity": 0,
  },
  "growth-quality": {
    "growth-signal": 1,
    "per-share": 0,
  },
  "valuation-basics": {
    "low-multiple": 1,
    comparison: 2,
  },
  "financial-health": {
    "debt-context": 1,
    liquidity: 1,
  },
  "risk-and-uncertainty": {
    "data-vs-company": 1,
    conflict: 1,
  },
  "portfolio-diversification": {
    diversification: 1,
    "company-vs-portfolio": 1,
  },
};

export type AcademyQuizGradeV3 = {
  lessonId: string;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  policyVersion: string;
};

/**
 * Deterministic grading intended for trusted server code. Correct-answer keys
 * are deliberately separated from the public Academy catalog so UI code does
 * not need to carry grading answers.
 */
export function gradeAcademyQuizV3(
  lessonId: string,
  answers: Readonly<Record<string, number | null | undefined>>,
): AcademyQuizGradeV3 | null {
  const lesson = getAcademyLessonV3(lessonId);
  const key = ANSWER_KEY_V3[lessonId];
  if (!lesson || !key || lesson.quiz.length === 0) return null;

  let correct = 0;
  for (const question of lesson.quiz) {
    const selected = answers[question.id];
    if (Number.isInteger(selected) && selected === key[question.id]) correct += 1;
  }

  const total = lesson.quiz.length;
  const score = Math.round((correct / total) * 10000) / 100;
  return {
    lessonId,
    score,
    correct,
    total,
    passed: score >= lesson.passingScore,
    policyVersion: ACADEMY_V3_QUIZ_POLICY_VERSION,
  };
}
