import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle2, Circle, GraduationCap } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { ACADEMY_LESSONS_V3 } from "@/lib/academy/catalog-v3";
import { deriveInvestorScoreV3 } from "@/lib/academy/investor-score-v3";
import { loadAcademyProgressV3, toInvestorScoreProgressV3 } from "@/lib/academy/progress-repository-v3";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Academy" };

function scoreLevelLabel(level: string, sv: boolean) {
  if (level === "ADVANCED") return sv ? "Avancerad" : "Advanced";
  if (level === "ESTABLISHED") return sv ? "Etablerad grund" : "Established foundation";
  if (level === "DEVELOPING") return sv ? "Under utveckling" : "Developing";
  return sv ? "Grundnivå" : "Foundation";
}

export default async function AcademyPage() {
  if (!isFeatureEnabled("academy")) notFound();
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const sv = locale === "sv";
  const progressResult = await loadAcademyProgressV3(user.id);
  const progressByLesson = new Map(progressResult.progress.map((row) => [row.lesson_id, row]));
  const investorScore = isFeatureEnabled("investorScore")
    ? deriveInvestorScoreV3(toInvestorScoreProgressV3(progressResult.progress))
    : null;

  return (
    <Section>
      <Container>
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">StockBox Academy</p>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">{sv ? "Bli bättre på att analysera – utan att ändra analysens objektivitet" : "Become a better analyst — without changing analysis objectivity"}</h1>
          <p className="mt-4 text-sm leading-6 text-[#9aa7b8]">{sv ? "Academy tränar din förståelse för bolagsanalys. Din utbildningsprogress påverkar aldrig StockBox objektiva rating, rekommendation eller User Match." : "Academy trains your understanding of company analysis. Your learning progress never affects StockBox objective ratings, recommendations or User Match."}</p>
        </div>

        {!progressResult.ok ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20 text-sm text-amber-100">{sv ? "Progress kunde inte verifieras just nu. StockBox visar därför inga påhittade framsteg eller poäng." : "Progress could not be verified right now. StockBox therefore shows no invented progress or score."}</Card>
        ) : null}

        {investorScore && progressResult.ok ? (
          <Card className="mt-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" /><h2 className="font-semibold text-[#f4efe5]">Investor Score</h2></div>
                <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Endast utbildningsprogress – inte investeringslämplighet, förmögenhet, avkastning eller ett aktiebetyg." : "Learning progress only — not investment suitability, wealth, returns or a stock rating."}</p>
              </div>
              <div className="text-right"><p className="number text-3xl font-semibold text-[#f4efe5]">{investorScore.score.toFixed(1)}</p><p className="text-xs text-[#9aa7b8]">/100 · {scoreLevelLabel(investorScore.level, sv)}</p></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-[#8f9bac]">{sv ? "Kunskap" : "Knowledge"}</p><p className="number mt-1 font-semibold">{investorScore.knowledgeScore.toFixed(1)}</p></div>
              <div><p className="text-xs text-[#8f9bac]">{sv ? "Genomfört" : "Completion"}</p><p className="number mt-1 font-semibold">{investorScore.completionScore.toFixed(1)}</p></div>
              <div><p className="text-xs text-[#8f9bac]">{sv ? "Bredd" : "Breadth"}</p><p className="number mt-1 font-semibold">{investorScore.breadthScore.toFixed(1)}</p></div>
              <div><p className="text-xs text-[#8f9bac]">{sv ? "Underlag" : "Coverage"}</p><p className="number mt-1 font-semibold">{investorScore.confidence.toFixed(1)}%</p></div>
            </div>
          </Card>
        ) : null}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {ACADEMY_LESSONS_V3.map((lesson) => {
            const progress = progressByLesson.get(lesson.id);
            const passed = Boolean(progress?.passed);
            return (
              <Link key={lesson.id} href={`/academy/${lesson.id}`} className="block rounded-xl border border-white/10 bg-[#0d1c2e]/70 p-5 transition hover:border-[#b99b5f]/40 hover:bg-white/[0.055]">
                <div className="flex items-start justify-between gap-4">
                  <BookOpen className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
                  {passed ? <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-label={sv ? "Godkänd" : "Passed"} /> : <Circle className="h-5 w-5 text-[#667386]" aria-hidden="true" />}
                </div>
                <h2 className="mt-4 text-lg font-semibold text-[#f4efe5]">{sv ? lesson.title.sv : lesson.title.en}</h2>
                <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{sv ? lesson.summary.sv : lesson.summary.en}</p>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-[#8f9bac]">
                  <span>~{lesson.estimatedMinutes} min</span>
                  <span>{sv ? `Godkänt: ${lesson.passingScore}%` : `Pass: ${lesson.passingScore}%`}</span>
                  {progress ? <span>{sv ? `Bäst: ${progress.best_score.toFixed(0)}%` : `Best: ${progress.best_score.toFixed(0)}%`}</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
