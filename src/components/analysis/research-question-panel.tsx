"use client";

import { useMemo, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { answerResearchQuestion, researchQuestions, type ResearchQuestionId } from "@/lib/analysis/question-mode";
import type { AnalysisReport } from "@/lib/analysis/types";
import type { Locale } from "@/lib/i18n/types";

function copyFor(locale: Locale) {
  return locale === "sv" ? {
    title: "Fråga StockBox",
    subtitle: "Svar byggs från rapportens verifierade data, poäng, risker, valuation och bevakningssignaler. Saknas data markeras osäkerheten.",
    grounded: "Datagrundat svar",
  } : {
    title: "Ask StockBox",
    subtitle: "Answers are built from the report's verified data, scores, risks, valuation and watch signals. Missing data is called out explicitly.",
    grounded: "Grounded answer",
  };
}

function localizedQuestion(id: ResearchQuestionId, fallback: string, locale: Locale) {
  if (locale !== "sv") return fallback;
  return {
    score: "Varför ligger StockBox-poängen där den ligger?",
    biggest_risk: "Vilken är den största risken?",
    bull_case: "Vilket är starkaste bull-argumentet?",
    bear_case: "Vilket är starkaste bear-argumentet?",
    peer_benchmark: "Hur står den sig mot peers?",
    priced_in: "Vad verkar vara inprisat?",
    watch_next: "Vilka mått ska jag bevaka framåt?",
  }[id];
}

export function ResearchQuestionPanel({ report, locale = "en" }: { report: AnalysisReport; locale?: Locale }) {
  const copy = copyFor(locale);
  const [selected, setSelected] = useState<ResearchQuestionId>("score");
  const answer = useMemo(() => answerResearchQuestion(report, selected), [report, selected]);

  return (
    <div className="rounded-lg border border-white/10 bg-[#081421] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
            <MessageSquareText className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            {copy.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{copy.subtitle}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {researchQuestions.map((question) => (
          <button
            key={question.id}
            type="button"
            onClick={() => setSelected(question.id)}
            className={selected === question.id
              ? "rounded-md border border-[#b99b5f]/50 bg-[#b99b5f]/15 px-3 py-2 text-xs font-semibold text-[#f4efe5]"
              : "rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-[#c9d2df] hover:bg-white/8"}
          >
            {localizedQuestion(question.id, question.label, locale)}
          </button>
        ))}
      </div>
      <div className="mt-5 rounded-md border border-white/10 bg-white/5 p-4">
        <p className="text-xs font-semibold uppercase text-[#e1cb95]">{copy.grounded}</p>
        <p className="mt-2 text-sm leading-6 text-[#d6deea]">{answer}</p>
      </div>
    </div>
  );
}
