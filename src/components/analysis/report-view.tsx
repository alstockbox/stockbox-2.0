import { AlertCircle, CheckCircle2, FileText, ShieldAlert } from "lucide-react";
import type { AnalysisReport, Flag, Metrics, UiMode } from "@/lib/analysis/types";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { ScoreChart } from "./score-chart";
import { adminQaSections } from "./admin-qa";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { ReportExportActions } from "./report-export-actions";
import type { Locale } from "@/lib/i18n/types";

function metricLabelsFor(copy: ReturnType<typeof getP0Copy>["report"]): Record<keyof Metrics, string> {
  return {
    revenueGrowth1y: copy.metricLabels.revenueGrowthAnnual, revenueCagr3y: copy.metricLabels.revenueCagr3y, epsGrowth1y: copy.metricLabels.epsGrowth1y,
    grossMargin: copy.metricLabels.grossMargin, operatingMargin: copy.metricLabels.operatingMargin, netMargin: copy.metricLabels.netMargin,
    fcf: copy.metricLabels.fcf, fcfMargin: copy.metricLabels.fcfMargin, cashConversion: copy.metricLabels.cashConversion,
    debtToEquity: copy.metricLabels.debtToEquity, debtToAssets: copy.metricLabels.debtToAssets, netDebt: copy.metricLabels.netDebt,
    interestCoverage: copy.metricLabels.interestCoverage, earningsYield: copy.metricLabels.earningsYield, fcfYield: copy.metricLabels.fcfYield,
    priceMomentum1y: copy.metricLabels.priceMomentum1y, priceMomentum3m: copy.metricLabels.priceMomentum3m,
  };
}

function formatMetric(key: keyof Metrics, value: number | null, unavailable: string, reportingCurrency?: string | null) {
  if (value === null) return unavailable;
  if (["fcf", "netDebt"].includes(key)) return formatCompactCurrency(value, reportingCurrency ?? undefined);
  if (
    [
      "revenueGrowth1y",
      "revenueCagr3y",
      "epsGrowth1y",
      "grossMargin",
      "operatingMargin",
      "netMargin",
      "fcfMargin",
      "earningsYield",
      "fcfYield",
      "priceMomentum1y",
      "priceMomentum3m",
      "debtToAssets"
    ].includes(key)
  ) {
    return formatPercent(value);
  }
  return formatNumber(value, { maximumFractionDigits: 2 });
}

function FlagList({ flags, tone, emptyLabel }: { flags: Flag[]; tone: "red" | "green"; emptyLabel: string }) {
  const Icon = tone === "red" ? AlertCircle : CheckCircle2;
  return (
    <div className="space-y-3">
      {flags.length ? (
        flags.map((flag) => (
          <div key={`${flag.title}-${flag.metric}`} className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <Icon
                className={tone === "red" ? "h-4 w-4 text-red-300" : "h-4 w-4 text-emerald-300"}
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-[#f4efe5]">{flag.title}</p>
              <Badge className="ml-auto">{flag.severity}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#c9d2df]">{flag.detail}</p>
          </div>
        ))
      ) : (
        <p className="text-sm text-[#9aa7b8]">{emptyLabel}</p>
      )}
    </div>
  );
}

function researchScoreValue(score: number | null, insufficientData: string) {
  return score === null ? insufficientData : Math.round(score).toString();
}

function localizedStatus(status: string, copy: ReturnType<typeof getP0Copy>["report"]) {
  if (status === "available") return copy.available;
  if (status === "partial") return copy.partial;
  if (status === "unavailable") return copy.unavailable;
  return status;
}

export function ReportView({ report, mode = "pro", locale = "en" }: { report: AnalysisReport; mode?: UiMode; locale?: Locale }) {
  const copy = getP0Copy(locale).report;
  const extended = report.analysisType === "deep" || report.analysisType === "research";
  const showExplainability = mode === "pro" || extended;
  const showNumbers = mode === "pro" || report.analysisType !== "summary";
  const showValuation = mode === "pro" || extended;
  const engine = report.engine;
  const growthBasis = engine?.metrics.growth.revenueGrowthBasis;
  const displayedMetricLabels = {
    ...metricLabelsFor(copy),
    revenueGrowth1y: growthBasis === "TTM_YOY" ? copy.metricLabels.revenueGrowthTtm : copy.metricLabels.revenueGrowthAnnual,
  };
  const scoreAvailable = report.score.score !== null;
  const adminDiagnostics = adminQaSections(report.adminQa);
  return (
    <div className="space-y-5" data-report-print>
      <div className="flex justify-end print:hidden">
        <ReportExportActions label={copy.exportPdf} hint={copy.exportPdfHint} />
      </div>
      {report.dataStatus === "stale" ? (
        <Card className="border-red-300/30 bg-red-950/20 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-200">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            {copy.staleTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#c9d2df]">{copy.staleCopy}</p>
        </Card>
      ) : null}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{report.ticker}</Badge>
              <Badge>{report.analysisType}</Badge>
              <Badge>{report.investmentProfile.replace("_", " ")}</Badge>
              {report.analysisArchetype ? <Badge>{report.analysisArchetype.replaceAll("_", " ")}</Badge> : null}
            </div>
            <h1 className="serif mt-4 text-3xl font-semibold text-[#f4efe5]">{report.companyName}</h1>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-[#d6deea]">{report.oneSentence}</p>
          </div>
          <div className="grid min-w-56 grid-cols-2 gap-3 text-center">
            <div className="rounded-md border border-[#b99b5f]/30 bg-[#b99b5f]/10 p-4">
              <p className="text-xs text-[#e1cb95]">{copy.stockboxScore}</p>
              <p className={`${scoreAvailable ? "number text-4xl" : "text-lg"} mt-1 font-semibold text-[#f4efe5]`}>
                {scoreAvailable ? report.score.score : copy.noRating}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-[#9aa7b8]">{copy.confidence}</p>
              <p className="number mt-1 text-4xl font-semibold text-[#f4efe5]">{report.score.confidence}%</p>
            </div>
          </div>
          {report.dataCoverage !== undefined || report.dataAsOf ? (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#9aa7b8]">
              {report.dataCoverage !== undefined ? <span>{copy.dataCoverage} {formatPercent(report.dataCoverage, 0)}</span> : null}
              {engine?.diagnostics.financialFlowPeriodEnd ? (
                <span>{engine.diagnostics.financialFlowPeriodBasis === "FY" ? copy.financialFlowFy : copy.financialFlowTtm} {copy.through} {engine.diagnostics.financialFlowPeriodEnd}</span>
              ) : report.dataAsOf ? <span>{copy.financialDataThrough} {report.dataAsOf}</span> : null}
              {engine?.diagnostics.balanceSheetPeriodEnd ? <span>{copy.balanceSheetAsOf} {engine.diagnostics.balanceSheetPeriodEnd}</span> : null}
              {engine?.diagnostics.marketPriceDate ? <span>{copy.marketPriceAsOf} {engine.diagnostics.marketPriceDate}</span> : null}
              {report.modelVersion ? <span>{report.modelVersion}</span> : null}
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.modelAssessment}</h2>
            <Badge>{report.recommendation}</Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{report.summary}</p>
          {report.score.score !== null && report.score.personalizedScore !== null ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Meter value={report.score.score} label={copy.generalScore} />
              <Meter value={report.score.personalizedScore} label={copy.personalizedScore} />
            </div>
          ) : (
            <p className="mt-5 text-sm text-[#e1cb95]">{copy.belowRatingThreshold}</p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.sixtySecond}</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-semibold text-[#e1cb95]">{copy.shortTerm}</dt>
              <dd className="mt-1 leading-6 text-[#c9d2df]">{report.shortTermAssessment}</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#e1cb95]">{copy.longTerm}</dt>
              <dd className="mt-1 leading-6 text-[#c9d2df]">{report.longTermAssessment}</dd>
            </div>
          </dl>
        </Card>
      </div>

      {showExplainability ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.explainability}</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <ScoreChart dimensions={report.score.dimensions} />
          <div className="space-y-3">
            {report.score.dimensions.map((dimension) => (
              <div key={dimension.key} className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#f4efe5]">{dimension.label}</p>
                  <p className="number text-sm text-[#e1cb95]">
                    {dimension.score === null ? copy.unavailable : Math.round(dimension.score)}
                  </p>
                </div>
                {dimension.coverage !== undefined ? (
                  <p className="mt-1 text-xs text-[#9aa7b8]">{copy.coverage} {formatPercent(dimension.coverage, 0)}</p>
                ) : null}
                <p className="mt-1 text-xs leading-5 text-[#9aa7b8]">{dimension.rationale}</p>
                {extended && dimension.contributors?.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-[#e1cb95]">{copy.contributors}</summary>
                    <div className="mt-2 space-y-1 text-xs text-[#9aa7b8]">
                      {dimension.contributors.map((item) => (
                        <p key={item.label}>{item.label}: {item.availability === "available" ? `${Math.round(item.score ?? 0)}/100` : item.availability ?? copy.missing}</p>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </Card> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
            <ShieldAlert className="h-5 w-5 text-red-300" aria-hidden="true" />
            {copy.redFlags}
          </h2>
          <FlagList flags={report.redFlags} tone="red" emptyLabel={copy.noFlags} />
        </Card>
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            {copy.greenFlags}
          </h2>
          <FlagList flags={report.greenFlags} tone="green" emptyLabel={copy.noFlags} />
        </Card>
      </div>

      {showNumbers ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.numbers}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(report.metrics) as Array<keyof Metrics>).map((key) => (
            <div key={key} className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-[#9aa7b8]">{displayedMetricLabels[key]}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">
                {formatMetric(key, report.metrics[key], copy.unavailable, report.reportingCurrency)}
              </p>
              {report.metrics[key] === null && engine ? (
                <p className="mt-1 text-xs leading-5 text-[#9aa7b8]">
                  {engine.missingData.find((item) => item.field.toLowerCase().includes(key.toLowerCase()))?.reason ?? copy.missingMetricReason}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Card> : null}

      {report.scenarios.length ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.bullBaseBear}</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {report.scenarios.map((scenario) => (
            <details key={scenario.caseName} className="rounded-md border border-white/10 bg-white/5 p-4" open={scenario.caseName === "Base"}>
              <summary className="cursor-pointer text-sm font-semibold text-[#f4efe5]">
                {scenario.caseName === "Base" ? copy.base : scenario.caseName === "Bull" ? copy.bull : copy.bear} {copy.case}
              </summary>
              <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{scenario.qualitativeOutcome}</p>
              <p className="mt-3 text-xs font-semibold text-[#e1cb95]">{copy.assumptions}</p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-[#9aa7b8]">
                {scenario.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </Card> : null}

      {showValuation ? <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.valuation}</h2>
          {engine ? <Badge>{engine.dcf.status}</Badge> : null}
        </div>
        {engine ? <p className="mt-2 text-sm text-[#9aa7b8]">{engine.dcf.method}</p> : null}
        {report.dcf.suitable ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-[#9aa7b8]">{copy.bear}</p>
              <p className="number mt-1 text-xl font-semibold text-[#f4efe5]">
                {formatCompactCurrency(report.dcf.bear, engine?.dcf.currency)}
              </p>
            </div>
            <div className="rounded-md border border-[#b99b5f]/30 bg-[#b99b5f]/10 p-4">
              <p className="text-xs text-[#e1cb95]">{copy.base}</p>
              <p className="number mt-1 text-xl font-semibold text-[#f4efe5]">
                {formatCompactCurrency(report.dcf.base, engine?.dcf.currency)}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-[#9aa7b8]">{copy.bull}</p>
              <p className="number mt-1 text-xl font-semibold text-[#f4efe5]">
                {formatCompactCurrency(report.dcf.bull, engine?.dcf.currency)}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{report.dcf.reason}</p>
        )}
        {engine?.dcf.assumptionNotes?.length ? (
          <details className="mt-4 rounded-md border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[#e1cb95]">{copy.assumptionsSensitivity}</summary>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-[#9aa7b8]">
              {engine.dcf.assumptionNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </details>
        ) : null}
      </Card> : null}

      {report.research ? <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-[#e1cb95]">{copy.deepResearch}</p>
            <h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{copy.researchLens}</h2>
          </div>
          <div className="text-right text-xs text-[#9aa7b8]">
            <p>{copy.researchConfidence} {report.research.confidence}%</p>
            <p>{copy.researchCoverage} {formatPercent(report.research.coverage, 0)}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {([
            [copy.quality, report.research.quality],
            [copy.opportunity, report.research.opportunity],
            [copy.inflection, report.research.inflection],
          ] as const).map(([label, researchScore]) => (
            <div key={label} className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-semibold text-[#e1cb95]">{label}</p>
              <p className={`${researchScore.score === null ? "text-base" : "number text-3xl"} mt-2 font-semibold text-[#f4efe5]`}>{researchScoreValue(researchScore.score, copy.insufficientData)}</p>
              <div className="mt-3 flex justify-between gap-3 text-xs text-[#9aa7b8]">
                <span>{copy.confidence} {researchScore.confidence}%</span>
                <span>{copy.coverage} {formatPercent(researchScore.coverage, 0)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {([
            [copy.working, report.research.positives],
            [copy.deteriorating, report.research.negatives],
            [copy.changing, report.research.changes],
          ] as const).map(([title, signals]) => (
            <section key={title}>
              <h3 className="text-xs font-semibold text-[#e1cb95]">{title}</h3>
              <div className="mt-3 space-y-2 text-sm leading-6 text-[#c9d2df]">
                {signals.length ? signals.slice(0, 6).map((item) => <p key={item.id}>{item.statement}</p>) : <p className="text-[#9aa7b8]">{copy.insufficientSignals}</p>}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-6 grid gap-6 border-t border-white/10 pt-5 lg:grid-cols-2">
          <section>
            <h3 className="text-sm font-semibold text-[#f4efe5]">{copy.recentEvents}</h3>
            <div className="mt-3 space-y-2">
              {report.research.events.length ? report.research.events.slice(0, 8).map((event) => (
                <a key={event.accession} href={event.url} target="_blank" rel="noreferrer" className="block rounded-md border border-white/10 p-3 text-sm hover:bg-white/5">
                  <span className="font-semibold text-[#f4efe5]">{event.form} - {event.filingDate}</span>
                  <span className="mt-1 block text-xs text-[#9aa7b8]">{event.category.replaceAll("_", " ")}{event.items.length ? ` - ${copy.items} ${event.items.join(", ")}` : ""}</span>
                </a>
              )) : <p className="text-sm text-[#9aa7b8]">{copy.noRecentEvents}</p>}
            </div>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-[#f4efe5]">{copy.researchCoverageTitle}</h3>
            <dl className="mt-3 divide-y divide-white/10 text-sm">
              {report.research.layers.map((layer) => (
                <div key={layer.layer} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-[#c9d2df]">{layer.label}</dt>
                  <dd className={layer.status === "available" ? "text-emerald-200" : layer.status === "partial" ? "text-[#e1cb95]" : "text-[#9aa7b8]"}>{localizedStatus(layer.status, copy)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <details className="mt-6 border-t border-white/10 pt-5">
          <summary className="cursor-pointer text-sm font-semibold text-[#f4efe5]">{copy.keyEvidence}</summary>
          <div className="mt-3 space-y-3 text-xs leading-5 text-[#9aa7b8]">
            {report.research.signals.slice(0, 12).map((item) => (
              <p key={item.id}><span className="font-semibold text-[#c9d2df]">{item.metric}</span>: {item.statement}{item.periodCurrent ? ` (${item.periodPrevious ?? copy.prior} ${copy.to} ${item.periodCurrent})` : ""}</p>
            ))}
            {report.research.evidence.map((item) => <p key={item.id}><a href={item.source.url} target="_blank" rel="noreferrer" className="font-semibold text-[#e1cb95] hover:text-[#f4efe5]">{item.title}</a> - {item.kind.replaceAll("_", " ")}</p>)}
          </div>
        </details>
      </Card> : null}

      {report.deepReport ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.deepReport}</h2>
        <div className="mt-4 divide-y divide-white/10">
          {report.deepReport.sections.map((section) => (
            <details key={section.id} className="py-3" open={section.id === "executive_thesis"}>
              <summary className="cursor-pointer text-sm font-semibold text-[#f4efe5]">
                {section.title} <span className="ml-2 text-xs font-normal text-[#9aa7b8]">{localizedStatus(section.status, copy)}</span>
              </summary>
              <div className="mt-2 space-y-2 text-sm leading-6 text-[#c9d2df]">
                {section.findings.map((finding) => <p key={finding.statement}>{finding.statement}</p>)}
                {section.unknowns.map((unknown) => <p key={unknown} className="text-[#9aa7b8]">{copy.unknown}: {unknown}</p>)}
              </div>
            </details>
          ))}
        </div>
      </Card> : null}

      {report.research ? <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.institutionalModules}</h2>
          <Badge>{report.research.modules.filter((module) => module.status !== "unavailable").length}/{report.research.modules.length} {copy.available}</Badge>
        </div>
        <div className="mt-4 divide-y divide-white/10">
          {report.research.modules.map((module) => (
            <details key={module.id} className="py-3" open={module.id === "fundamental_core"}>
              <summary className="cursor-pointer text-sm font-semibold text-[#f4efe5]">
                {module.title} <span className="ml-2 text-xs font-normal text-[#9aa7b8]">{localizedStatus(module.status, copy)}</span>
              </summary>
              <div className="mt-2 space-y-2 text-sm leading-6 text-[#c9d2df]">
                {module.findings.map((finding) => <p key={finding.statement}>{finding.statement}</p>)}
                {module.positiveSignals.map((signal) => <p key={signal} className="text-emerald-200">{copy.positive}: {signal}</p>)}
                {module.negativeSignals.map((signal) => <p key={signal} className="text-red-200">{copy.negative}: {signal}</p>)}
                {module.unknowns.map((unknown) => <p key={unknown} className="text-[#9aa7b8]">{copy.unknown}: {unknown}</p>)}
              </div>
            </details>
          ))}
        </div>
      </Card> : null}

      {showExplainability && engine ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.methodology}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(report.confidenceBreakdown ?? {}).map(([key, value]) => (
            <div key={key} className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs capitalize text-[#9aa7b8]">{key.replace(/([A-Z])/g, " $1")}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{value === null ? copy.notApplicable : `${value}%`}</p>
            </div>
          ))}
        </div>
        <details className="mt-4 rounded-md border border-white/10 bg-white/5 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#e1cb95]">{copy.metricSources}</summary>
          <div className="mt-3 space-y-2 text-xs leading-5 text-[#9aa7b8]">
            {Object.entries(engine.provenance).map(([metric, source]) => (
              <p key={metric}><span className="font-semibold text-[#c9d2df]">{metric}</span>: {source.source}{source.concept ? ` / ${source.concept}` : ""}{source.periodEnd ? ` / ${source.periodEnd}` : ""}{source.periodBasis ? ` / ${source.periodBasis}` : ""} ({source.valueKind})</p>
            ))}
            {engine.reconciliation.map((check) => <p key={check.code}>{check.status}: {check.message}</p>)}
          </div>
        </details>
      </Card> : null}

      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
          <FileText className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
          {copy.sourcesFreshness}
        </h2>
        <div className="mt-4 space-y-3">
          {report.sources.length ? (
            report.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-white/10 bg-white/5 p-3 text-sm hover:bg-white/8"
              >
                <span className="font-semibold text-[#f4efe5]">{source.name}</span>
                <span className="mt-1 block text-[#9aa7b8]">{source.freshness}</span>
              </a>
            ))
          ) : (
            <p className="text-sm text-[#9aa7b8]">{copy.noSource}</p>
          )}
        </div>
        {showExplainability && report.providerDiagnostics?.length ? (
          <div className="mt-4 space-y-2 text-xs leading-5 text-[#9aa7b8]">
            {report.providerDiagnostics.map((diagnostic) => (
              <p key={`${diagnostic.provider}-${diagnostic.capability}`}>
                <span className="font-semibold text-[#c9d2df]">{diagnostic.provider}</span>: {localizedStatus(diagnostic.status, copy)}{diagnostic.reason ? ` (${diagnostic.reason})` : ""}
              </p>
            ))}
          </div>
        ) : null}
        {adminDiagnostics.length ? (
          <details className="mt-5 rounded-md border border-amber-200/20 bg-amber-200/5 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-amber-100">{copy.adminDiagnostics}</summary>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {adminDiagnostics.map((section) => (
                <div key={section.label}>
                  <p className="text-xs font-semibold text-[#c9d2df]">{section.label}</p>
                  {section.values.length ? section.values.map((value) => (
                    <p key={value} className="mt-1 text-xs leading-5 text-[#9aa7b8]">{value}</p>
                  )) : <p className="mt-1 text-xs text-[#7f8b9b]">{copy.none}</p>}
                </div>
              ))}
            </div>
          </details>
        ) : null}
        {report.score.missingData.length ? (
          <div className="mt-5 rounded-md border border-[#b99b5f]/20 bg-[#b99b5f]/10 p-3">
            <p className="text-sm font-semibold text-[#e1cb95]">{copy.missingData}</p>
            <p className="mt-1 text-sm leading-6 text-[#c9d2df]">
              {report.score.missingData.slice(0, 10).join(", ")}
            </p>
          </div>
        ) : null}
        <p className="mt-5 text-xs leading-5 text-[#9aa7b8]">{report.disclaimer}</p>
      </Card>
    </div>
  );
}
