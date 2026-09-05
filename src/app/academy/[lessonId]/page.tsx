import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { submitAcademyQuizV3Action } from "@/lib/academy/actions-v3";
import { getAcademyLessonV3 } from "@/lib/academy/catalog-v3";
import { loadAcademyProgressV3 } from "@/lib/academy/progress-repository-v3";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Academy lesson" };

type LessonPageProps = {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ result?: string; error?: string }>;
};

export default async function AcademyLessonPage({ params, searchParams }: LessonPageProps) {
  if (!isFeatureEnabled("academy")) notFound();
  const [{ lessonId }, query, user, locale] = await Promise.all([params, searchParams, requireUser(), getLocale()]);
  const lesson = getAcademyLessonV3(lessonId);
  if (!lesson) notFound();
  const sv = locale === "sv";
  const progressResult = await loadAcademyProgressV3(user.id);
  const progress = progressResult.progress.find((item) => item.lesson_id === lesson.id) ?? null;

  return (
    <Section>
      <Container>
        <Link href="/academy" className="inline-flex items-center gap-2 text-sm font-semibold text-[#e1cb95] hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{sv ? "Till Academy" : "Back to Academy"}</Link>

        <div className="mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">StockBox Academy</p>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">{sv ? lesson.title.sv : lesson.title.en}</h1>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">{sv ? lesson.summary.sv : lesson.summary.en}</p>
          <p className="mt-2 text-xs text-[#7f8b9b]">~{lesson.estimatedMinutes} min · {sv ? `Godkänt från ${lesson.passingScore}%` : `Pass from ${lesson.passingScore}%`}</p>
        </div>

        {query.result === "recorded" && progressResult.ok && progress ? (
          <Card className={`mt-6 ${progress.passed ? "border-emerald-300/20 bg-emerald-950/20" : "border-amber-300/20 bg-amber-950/20"}`}>
            <div className="flex items-center gap-2">
              {progress.passed ? <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" /> : null}
              <p className="font-semibold text-[#f4efe5]">{progress.passed ? (sv ? "Lektionen är godkänd" : "Lesson passed") : (sv ? "Försöket är sparat" : "Attempt saved")}</p>
            </div>
            <p className="mt-2 text-sm text-[#c9d2df]">{sv ? `Bästa verifierade resultat: ${progress.best_score.toFixed(0)}%. Försök: ${progress.attempts}.` : `Best verified score: ${progress.best_score.toFixed(0)}%. Attempts: ${progress.attempts}.`}</p>
          </Card>
        ) : null}
        {query.error === "save" ? <Card className="mt-6 border-red-300/20 bg-red-950/20 text-sm text-red-100">{sv ? "Quizet kunde inte sparas. Din Investor Score har inte ändrats." : "The quiz could not be saved. Your Investor Score has not changed."}</Card> : null}
        {!progressResult.ok ? <Card className="mt-6 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">{sv ? "Sparad progress kunde inte verifieras. StockBox visar därför inget antaget resultat." : "Saved progress could not be verified. StockBox therefore shows no assumed result."}</Card> : null}

        <Card className="mt-7">
          <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Efter lektionen ska du kunna" : "After this lesson you should be able to"}</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[#c9d2df]">
            {lesson.objectives.map((objective, index) => <li key={index}>• {sv ? objective.sv : objective.en}</li>)}
          </ul>
        </Card>

        <div className="mt-7 space-y-5">
          {lesson.sections.map((section, index) => (
            <Card key={index}>
              <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? section.heading.sv : section.heading.en}</h2>
              <p className="mt-3 text-[15px] leading-7 text-[#c9d2df]">{sv ? section.body.sv : section.body.en}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-7">
          <h2 className="text-xl font-semibold text-[#f4efe5]">Quiz</h2>
          <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{sv ? "Svar rättas på StockBox server. Webbläsaren skickar aldrig ett eget score- eller godkäntvärde." : "Answers are graded by the StockBox server. The browser never submits its own score or pass value."}</p>
          <form action={submitAcademyQuizV3Action} className="mt-6 space-y-7">
            <input type="hidden" name="lessonId" value={lesson.id} />
            {lesson.quiz.map((question, questionIndex) => (
              <fieldset key={question.id} className="space-y-3">
                <legend className="text-sm font-semibold text-[#f4efe5]">{questionIndex + 1}. {sv ? question.prompt.sv : question.prompt.en}</legend>
                {question.options.map((option, optionIndex) => (
                  <label key={optionIndex} className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-[#07111f]/60 p-3 text-sm text-[#c9d2df] hover:border-[#b99b5f]/35">
                    <input type="radio" name={`answer:${question.id}`} value={optionIndex} required className="mt-0.5" />
                    <span>{sv ? option.sv : option.en}</span>
                  </label>
                ))}
              </fieldset>
            ))}
            <Button className="min-h-11">{sv ? "Rätta och spara" : "Grade and save"}</Button>
          </form>
        </Card>

        <p className="mt-6 text-xs leading-5 text-[#7f8b9b]">{sv ? "Academy är utbildning, inte personlig investeringsrådgivning. Academy-resultat ändrar aldrig StockBox objektiva bolagsrating eller rekommendation." : "Academy is education, not personal investment advice. Academy results never change StockBox objective company ratings or recommendations."}</p>
      </Container>
    </Section>
  );
}
