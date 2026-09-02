import { AlertTriangle, Crosshair, Gauge, Radar, ShieldCheck, Sparkles } from "lucide-react";
import { buildIntelligenceSummary } from "@/lib/analysis/intelligence-report";
import type { AnalysisReport, UiMode } from "@/lib/analysis/types";
import type { Locale } from "@/lib/i18n/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreText(value: number | null, unavailable: string) {
  return finite(value) ? `${Math.round(value)}/100` : unavailable;
}

function coverageText(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function stageLabel(stage: string, locale: Locale) {
  if (locale !== "sv") return stage.replaceAll("_", " ");
  const labels: Record<string, string> = {
    dormant: "vilande",
    building: "byggs upp",
    confirming: "bekräftas",
    extended: "utsträckt",
    fragile: "skör",
    uncertain: "osäker",
  };
  return labels[stage] ?? stage;
}

function valueTrapLabel(risk: string, locale: Locale) {
  if (locale !== "sv") return `${risk} value-trap risk`;
  if (risk === "high") return "hög value-trap-risk";
  if (risk === "medium") return "måttlig value-trap-risk";
  return "låg value-trap-risk";
}

function Pillar({
  title,
  score,
  meta,
  coverage,
  unavailable,
  icon,
}: {
  title: string;
  score: number | null;
  meta: string;
  coverage?: number;
  unavailable: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[#e1cb95]" aria-hidden="true">{icon}</span>
          <p className="text-sm font-semibold text-[#f4efe5]">{title}</p>
        </div>
        <span className="number shrink-0 text-lg font-semibold text-[#f4efe5]">{scoreText(score, unavailable)}</span>
      </div>
      {finite(score) ? <Meter className="mt-3" value={score} /> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#9aa7b8]">
        <span>{meta}</span>
        {typeof coverage === "number" ? <span>· {coverageText(coverage)} coverage</span> : null}
      </div>
    </div>
  );
}

export function OpportunityIntelligencePanel({
  report,
  mode,
  locale,
}: {
  report: AnalysisReport;
  mode: UiMode;
  locale: Locale;
}) {
  const summary = buildIntelligenceSummary(report, locale);
  const sv = locale === "sv";
  const copy = sv
    ? {
        eyebrow: "StockBox Intelligence",
        title: "Opportunity Intelligence",
        unavailable: "Otillräcklig data",
        core: "Kärnkvalitet",
        canonical: "kanonisk",
        mispricing: "Felprissättning",
        inflection: "Tidig acceleration",
        opportunity: "Opportunity",
        confidence: "Samlad confidence",
        coverage: "Opportunity coverage",
        drivers: "Starkaste drivare",
        blockers: "Risker & blockerare",
        noBlockers: "Inga tydliga intelligence-blockerare i tillgänglig evidens.",
        missing: "Saknade pelare",
        disclosure: "Detta är en evidensbaserad research-signal, inte en kursprognos. Hög Opportunity kräver stöd från flera oberoende pelare; momentum ensamt räcker aldrig.",
      }
    : {
        eyebrow: "StockBox Intelligence",
        title: "Opportunity Intelligence",
        unavailable: "Insufficient data",
        core: "Core quality",
        canonical: "canonical",
        mispricing: "Mispricing",
        inflection: "Early inflection",
        opportunity: "Opportunity",
        confidence: "Combined confidence",
        coverage: "Opportunity coverage",
        drivers: "Strongest drivers",
        blockers: "Risks & blockers",
        noBlockers: "No clear intelligence blockers in the available evidence.",
        missing: "Missing pillars",
        disclosure: "This is an evidence-based research signal, not a price forecast. High Opportunity requires support from multiple independent pillars; momentum alone is never enough.",
      };

  const coreMeta = mode === "pro" && finite(summary.scores.canonicalCoreQuality)
    ? `${copy.canonical}: ${scoreText(summary.scores.canonicalCoreQuality, copy.unavailable)}`
    : sv
      ? "profilanpassad kvalitet & risk"
      : "profile-aware quality & risk";
  const driverLimit = mode === "pro" ? 6 : 4;
  const blockerLimit = mode === "pro" ? 6 : 3;

  return (
    <Card className="overflow-hidden border-[#b99b5f]/30 bg-[radial-gradient(circle_at_top_right,rgba(185,155,95,0.12),transparent_35%)]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#e1cb95]">
              <Radar className="h-4 w-4" aria-hidden="true" />
              {copy.eyebrow}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-[#f4efe5]">{copy.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#d8dee8]">{summary.headline}</p>
            <p className="mt-1 text-sm leading-6 text-[#9aa7b8]">{summary.thesis}</p>
          </div>
          <div className="min-w-[150px] rounded-xl border border-[#b99b5f]/25 bg-[#b99b5f]/10 p-4 text-right">
            <p className="text-xs uppercase tracking-[0.14em] text-[#d7c9a3]">{copy.opportunity}</p>
            <p className="number mt-1 text-3xl font-semibold text-[#f4efe5]">{scoreText(summary.scores.opportunity, copy.unavailable)}</p>
            <Badge className="mt-2">{summary.opportunity.label}</Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Pillar
            title={copy.core}
            score={summary.scores.coreQuality}
            meta={coreMeta}
            unavailable={copy.unavailable}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <Pillar
            title={copy.mispricing}
            score={summary.scores.mispricing}
            coverage={summary.coverage.mispricing}
            meta={`${summary.mispricing.label} · ${valueTrapLabel(summary.mispricing.valueTrapRisk, locale)}`}
            unavailable={copy.unavailable}
            icon={<Crosshair className="h-4 w-4" />}
          />
          <Pillar
            title={copy.inflection}
            score={summary.scores.inflection}
            coverage={summary.coverage.inflection}
            meta={`${stageLabel(summary.inflection.stage, locale)} · ${summary.inflection.overextensionRisk} extension risk`}
            unavailable={copy.unavailable}
            icon={<Sparkles className="h-4 w-4" />}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#f4efe5]">
                <Gauge className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
                {copy.confidence}
              </p>
              <span className="number text-sm text-[#d8dee8]">{coverageText(summary.confidence)}</span>
            </div>
            <Meter className="mt-3" value={summary.confidence * 100} />
            <p className="mt-3 text-xs text-[#9aa7b8]">{copy.coverage}: {coverageText(summary.coverage.opportunity)}</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <p className="text-sm font-semibold text-[#f4efe5]">{copy.drivers}</p>
            <div className="mt-3 space-y-2">
              {summary.topDrivers.slice(0, driverLimit).map((driver) => (
                <div key={`${driver.label}-${driver.source}`} className="flex items-start justify-between gap-3 text-xs">
                  <div>
                    <p className="text-[#d8dee8]">{driver.label}</p>
                    {mode === "pro" ? <p className="mt-0.5 text-[#7f8b9b]">{driver.source}</p> : null}
                  </div>
                  <span className="number shrink-0 text-[#e1cb95]">{Math.round(driver.score)}/100</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/15 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#f4efe5]">
            <AlertTriangle className="h-4 w-4 text-amber-200" aria-hidden="true" />
            {copy.blockers}
          </p>
          {summary.blockers.length ? (
            <ul className="mt-3 grid gap-2 text-xs leading-5 text-[#c9d2df] md:grid-cols-2">
              {summary.blockers.slice(0, blockerLimit).map((blocker) => <li key={blocker}>• {blocker}</li>)}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-[#9aa7b8]">{copy.noBlockers}</p>
          )}
          {summary.missingPillars.length ? (
            <p className="mt-3 text-xs text-[#9aa7b8]">{copy.missing}: {summary.missingPillars.join(", ")}</p>
          ) : null}
        </div>

        <p className="text-[11px] leading-5 text-[#7f8b9b]">{copy.disclosure}</p>
      </div>
    </Card>
  );
}
