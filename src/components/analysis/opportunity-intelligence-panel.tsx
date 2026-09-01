import { AlertCircle, Radar, ShieldCheck, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { buildIntelligencePresentation } from "@/lib/analysis/intelligence-presentation";
import type { IntelligenceSnapshot } from "@/lib/analysis/intelligence-snapshot";
import type { Locale } from "@/lib/i18n/types";
import { formatPercent } from "@/lib/utils/format";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const cardIcons = {
  core: ShieldCheck,
  mispricing: Target,
  inflection: TrendingUp,
  opportunity: Radar,
} as const;

export function OpportunityIntelligencePanel({
  snapshot,
  locale,
}: {
  snapshot: IntelligenceSnapshot;
  locale: Locale;
}) {
  const presentation = buildIntelligencePresentation(snapshot, locale);
  const unavailable = locale === "sv" ? "Otillgänglig" : "Unavailable";
  const confidenceLabel = locale === "sv" ? "Konfidens" : "Confidence";
  const coverageLabel = locale === "sv" ? "Täckning" : "Coverage";
  const warningLabel = locale === "sv" ? "Viktiga motbevis och risker" : "Important counter-evidence and risks";

  return (
    <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-[#f4efe5]">
            <Radar className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            {presentation.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{presentation.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{snapshot.opportunity.profile.replace("_", " ")}</Badge>
          {snapshot.mispricing.dataAsOf || snapshot.inflection.dataAsOf ? (
            <Badge>{snapshot.mispricing.dataAsOf ?? snapshot.inflection.dataAsOf}</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {presentation.cards.map((card) => {
          const Icon = cardIcons[card.id];
          return (
            <section key={card.id} className="rounded-lg border border-white/10 bg-[#081421]/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#e1cb95]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {card.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[#f4efe5]">{card.status}</p>
                </div>
                <p className="number shrink-0 text-xl font-semibold text-[#f4efe5]">
                  {finite(card.score) ? `${Math.round(card.score)}/100` : unavailable}
                </p>
              </div>

              {finite(card.score) ? <Meter value={card.score} className="mt-3" /> : null}
              <p className="mt-3 text-xs leading-5 text-[#9aa7b8]">{card.detail}</p>

              {card.confidence !== null || card.coverage !== null ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-[#c9d2df]">
                  {finite(card.confidence) ? <span>{confidenceLabel} {Math.round(card.confidence)}%</span> : null}
                  {finite(card.coverage) ? <span>{coverageLabel} {formatPercent(card.coverage, 0)}</span> : null}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {presentation.warnings.length ? (
        <div className="mt-5 rounded-lg border border-amber-300/20 bg-amber-950/15 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-100">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {warningLabel}
          </h3>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-[#d6deea]">
            {presentation.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-[#7f8b99]">{presentation.disclaimer}</p>
    </Card>
  );
}
