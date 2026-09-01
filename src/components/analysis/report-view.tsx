"use client";

import { useMemo, useState } from "react";
import { AlertCircle, BarChart3, CalendarClock, CheckCircle2, Compass, Database, Eye, FileText, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import type { AnalysisReport, Flag, InvestmentProfile, Metrics, ScoreContributor, UiMode } from "@/lib/analysis/types";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { StockBoxLogo } from "@/components/brand/stockbox-logo";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/meter";
import { ScoreChart } from "./score-chart";
import { adminQaSections } from "./admin-qa";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import { ReportExportActions } from "./report-export-actions";
import type { Locale } from "@/lib/i18n/types";
import { formatAnalysisTimestamp } from "@/lib/analysis/timestamp";
import { localizedResearchView, researchViewCopy, researchViewForReport } from "@/lib/analysis/research-view";
import { HistoricalResearchView } from "./historical-research";
import { ValuationScenarioLab } from "./valuation-scenario-lab";
import { ResearchQuestionPanel } from "./research-question-panel";
import { buildPeerBenchmarkComparison, type PeerBenchmarkRow } from "@/lib/analysis/peer-benchmark";
import { buildAnalystExpectationsSummary } from "@/lib/analysis/analyst-expectations";
import { orderScoreDimensions, profilePresentationFor } from "@/lib/analysis/profile-presentation";
import { applyAnalysisLens } from "@/lib/analysis/analysis-lens";
import { AnalysisLensControl } from "./analysis-lens-control";

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

function isFiniteMetric(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreLabel(value: number | null | undefined, unavailable: string) {
  return isFiniteMetric(value) ? `${Math.round(value)}/100` : unavailable;
}

function scoreDrivers(report: AnalysisReport, impact: ScoreContributor["impact"]) {
  return report.score.dimensions
    .flatMap((dimension) => (dimension.contributors ?? []).map((contributor) => ({ ...contributor, dimension: dimension.label })))
    .filter((contributor) => contributor.impact === impact && contributor.availability === "available")
    .sort((left, right) => (right.weight * Math.abs((right.score ?? 50) - 50)) - (left.weight * Math.abs((left.score ?? 50) - 50)))
    .slice(0, 6);
}

function unavailableAwareCurrency(value: number | null | undefined, currency: string | null | undefined, unavailable: string) {
  return isFiniteMetric(value) ? formatCompactCurrency(value, currency ?? undefined) : unavailable;
}

function currentSharePrice(report: AnalysisReport) {
  return {
    value: report.market?.price ?? report.engine?.dcf.currentPrice ?? report.historical?.price.at(-1)?.close ?? null,
    currency: report.market?.currency ?? report.engine?.dcf.currency ?? report.reportingCurrency,
  };
}

type ChangeDirection = "improved" | "worsened" | "unchanged" | "unavailable";
type ChangeRow = {
  label: string;
  previous: string;
  current: string;
  delta: string;
  direction: ChangeDirection;
};

function directionFor(previous: number | null | undefined, current: number | null | undefined, higherIsBetter = true): ChangeDirection {
  if (!isFiniteMetric(previous) || !isFiniteMetric(current)) return "unavailable";
  const delta = current - previous;
  if (Math.abs(delta) < 0.005) return "unchanged";
  return higherIsBetter ? delta > 0 ? "improved" : "worsened" : delta < 0 ? "improved" : "worsened";
}

function signedDelta(previous: number | null | undefined, current: number | null | undefined, formatter: (value: number) => string) {
  if (!isFiniteMetric(previous) || !isFiniteMetric(current)) return "—";
  const delta = current - previous;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatter(delta)}`;
}

function metricChangeRow(
  label: string,
  previous: number | null | undefined,
  current: number | null | undefined,
  unavailable: string,
  formatter: (value: number) => string,
  higherIsBetter = true,
): ChangeRow {
  return {
    label,
    previous: isFiniteMetric(previous) ? formatter(previous) : unavailable,
    current: isFiniteMetric(current) ? formatter(current) : unavailable,
    delta: signedDelta(previous, current, formatter),
    direction: directionFor(previous, current, higherIsBetter),
  };
}

function changeRows(report: AnalysisReport, previousReport: AnalysisReport | null | undefined, copy: ReturnType<typeof getP0Copy>["report"]): ChangeRow[] {
  if (!previousReport) return [];
  const previousPrice = currentSharePrice(previousReport);
  const currentPrice = currentSharePrice(report);
  const previousDimensions = new Map(previousReport.score.dimensions.map((dimension) => [dimension.key, dimension]));
  const dimensionRows = report.score.dimensions.map((dimension) => metricChangeRow(
    dimension.label,
    previousDimensions.get(dimension.key)?.score,
    dimension.score,
    copy.unavailable,
    (value) => `${Math.round(value)}/100`,
  ));
  return [
    metricChangeRow(copy.stockboxScore, previousReport.score.score, report.score.score, copy.unavailable, (value) => `${Math.round(value)}/100`),
    metricChangeRow(copy.confidence, previousReport.score.confidence, report.score.confidence, copy.unavailable, (value) => `${Math.round(value)}%`),
    metricChangeRow(copy.dataCoverage, previousReport.dataCoverage, report.dataCoverage, copy.unavailable, (value) => formatPercent(value, 0)),
    metricChangeRow(copy.currentSharePrice, previousPrice.value, currentPrice.value, copy.unavailable, (value) => formatCompactCurrency(value, currentPrice.currency ?? undefined)),
    metricChangeRow(copy.metricLabels.revenueGrowthAnnual, previousReport.metrics.revenueGrowth1y, report.metrics.revenueGrowth1y, copy.unavailable, (value) => formatPercent(value)),
    metricChangeRow(copy.metricLabels.operatingMargin, previousReport.metrics.operatingMargin, report.metrics.operatingMargin, copy.unavailable, (value) => formatPercent(value)),
    metricChangeRow(copy.metricLabels.netDebt, previousReport.metrics.netDebt, report.metrics.netDebt, copy.unavailable, (value) => formatCompactCurrency(value, report.reportingCurrency ?? undefined), false),
    metricChangeRow(copy.metricLabels.fcfYield, previousReport.metrics.fcfYield, report.metrics.fcfYield, copy.unavailable, (value) => formatPercent(value)),
    ...dimensionRows,
  ];
}

function directionLabel(direction: ChangeDirection, copy: ReturnType<typeof getP0Copy>["report"]) {
  if (direction === "improved") return copy.improved;
  if (direction === "worsened") return copy.worsened;
  if (direction === "unchanged") return copy.unchanged;
  return copy.dataUnavailable;
}

function WhatChanged({
  report,
  previousReport,
  copy,
  locale,
}: {
  report: AnalysisReport;
  previousReport?: AnalysisReport | null;
  copy: ReturnType<typeof getP0Copy>["report"];
  locale: Locale;
}) {
  if (!previousReport) return null;
  const rows = changeRows(report, previousReport, copy);
  const visibleRows = rows.filter((row, index, all) =>
    row.direction !== "unavailable"
    || index < 3
    || all.filter((item) => item.direction !== "unavailable").length < 6
  ).slice(0, 14);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.whatChanged}</h2>
          <p className="mt-2 text-sm text-[#9aa7b8]">
            {copy.previousAnalysis}: {formatAnalysisTimestamp(previousReport.generatedAt, locale)} · {copy.currentAnalysis}: {formatAnalysisTimestamp(report.generatedAt, locale)}
          </p>
        </div>
        <Badge>{previousReport.ticker}</Badge>
      </div>
      <div className="mt-5 overflow-x-auto rounded-md border border-white/10">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              {[copy.metric, copy.previousAnalysis, copy.currentAnalysis, copy.change, copy.changing].map((heading) => (
                <th key={heading} className="whitespace-nowrap border-b border-white/10 px-3 py-2 font-semibold text-[#e1cb95]">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.label}>
                <td className="whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#f4efe5]">{row.label}</td>
                <td className="whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#c9d2df]">{row.previous}</td>
                <td className="whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#c9d2df]">{row.current}</td>
                <td className="number whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#c9d2df]">{row.delta}</td>
                <td className="whitespace-nowrap border-b border-white/5 px-3 py-2">
                  <span className={row.direction === "improved" ? "text-emerald-200" : row.direction === "worsened" ? "text-red-200" : "text-[#9aa7b8]"}>
                    {directionLabel(row.direction, copy)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function peerBenchmarkStatusLabel(status: PeerBenchmarkRow["status"], copy: ReturnType<typeof getP0Copy>["report"]) {
  if (status === "strong") return copy.strongVsBenchmark;
  if (status === "weak") return copy.weakVsBenchmark;
  if (status === "in_range") return copy.inBenchmarkRange;
  return copy.dataUnavailable;
}

function peerBenchmarkValue(row: PeerBenchmarkRow, unavailable: string) {
  if (!isFiniteMetric(row.value)) return unavailable;
  return row.kind === "percent" ? formatPercent(row.value) : `${formatNumber(row.value, { maximumFractionDigits: 2 })}x`;
}

function peerBenchmarkRange(row: PeerBenchmarkRow) {
  const low = row.kind === "percent" ? formatPercent(row.attractiveOrStrong) : `${formatNumber(row.attractiveOrStrong, { maximumFractionDigits: 2 })}x`;
  const high = row.kind === "percent" ? formatPercent(row.expensiveOrWeak) : `${formatNumber(row.expensiveOrWeak, { maximumFractionDigits: 2 })}x`;
  return row.direction === "higher_is_better" ? `${high} - ${low}` : `${low} - ${high}`;
}

function PeerBenchmarkLens({ report, copy }: { report: AnalysisReport; copy: ReturnType<typeof getP0Copy>["report"] }) {
  const comparison = buildPeerBenchmarkComparison(report);
  const visibleRows = comparison.rows.slice(0, 9);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
            <BarChart3 className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            {copy.peerBenchmarkLens}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{comparison.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{copy.benchmarkOnly}</Badge>
          <Badge>{comparison.benchmarkVersion}</Badge>
        </div>
      </div>
      <p className="mt-4 rounded-md border border-[#b99b5f]/20 bg-[#b99b5f]/5 p-3 text-xs leading-5 text-[#d7c9a3]">
        {copy.benchmarkOnlyHint}
      </p>
      {visibleRows.length ? (
        <div className="mt-5 overflow-x-auto rounded-md border border-white/10">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                {[copy.metric, report.ticker, copy.sectorBenchmark, copy.changing, copy.status].map((heading) => (
                  <th key={heading} className="whitespace-nowrap border-b border-white/10 px-3 py-2 font-semibold text-[#e1cb95]">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.key}>
                  <td className="whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#f4efe5]">{row.label}</td>
                  <td className="number whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#c9d2df]">{peerBenchmarkValue(row, copy.unavailable)}</td>
                  <td className="whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#c9d2df]">{peerBenchmarkRange(row)}</td>
                  <td className="whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#9aa7b8]">
                    {row.direction === "higher_is_better" ? copy.higherIsBetter : copy.lowerIsBetter}
                  </td>
                  <td className="whitespace-nowrap border-b border-white/5 px-3 py-2">
                    <span className={row.status === "strong" ? "text-emerald-200" : row.status === "weak" ? "text-red-200" : "text-[#9aa7b8]"}>
                      {peerBenchmarkStatusLabel(row.status, copy)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[#9aa7b8]">{copy.dataUnavailable}</p>
      )}
      {comparison.missingReasons.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#e1cb95]">{copy.missingData}</summary>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-[#9aa7b8]">
            {comparison.missingReasons.slice(0, 8).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function AnalystExpectationsPanel({ report, copy }: { report: AnalysisReport; copy: ReturnType<typeof getP0Copy>["report"] }) {
  const summary = buildAnalystExpectationsSummary(report);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.analystExpectations}</h2>
          {summary.status === "unavailable" ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{copy.estimatesUnavailableHint}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{copy.estimateAvailability}: {summary.estimateAvailability === null ? copy.unavailable : `${summary.estimateAvailability}%`}</Badge>
          {summary.providerStatus ? <Badge>{copy.providerStatus}: {summary.providerStatus}</Badge> : null}
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {summary.rows.map((row) => (
          <div key={row.key} className="rounded-md border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-[#9aa7b8]">{row.label}</p>
            <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{isFiniteMetric(row.value) ? formatPercent(row.value) : copy.unavailable}</p>
            <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{row.note}</p>
          </div>
        ))}
      </div>
      {summary.missingReasons.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-[#e1cb95]">{copy.missingData}</summary>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-[#9aa7b8]">
            {summary.missingReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function WatchSignalList({ title, items, emptyLabel }: { title: string; items: string[]; emptyLabel: string }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase text-[#e1cb95]">{title}</h3>
      <div className="mt-3 space-y-2 text-sm leading-6 text-[#c9d2df]">
        {items.length ? items.slice(0, 8).map((item) => (
          <p key={item} className="flex gap-2">
            <Eye className="mt-1 h-4 w-4 shrink-0 text-[#e1cb95]" aria-hidden="true" />
            <span>{item}</span>
          </p>
        )) : <p className="text-[#9aa7b8]">{emptyLabel}</p>}
      </div>
    </section>
  );
}

function ScoreDriverList({
  title,
  drivers,
  tone,
  emptyLabel,
}: {
  title: string;
  drivers: ReturnType<typeof scoreDrivers>;
  tone: "positive" | "negative" | "neutral";
  emptyLabel: string;
}) {
  const Icon = tone === "positive" ? TrendingUp : tone === "negative" ? TrendingDown : BarChart3;
  const iconClass = tone === "positive" ? "text-emerald-300" : tone === "negative" ? "text-red-300" : "text-[#e1cb95]";
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[#f4efe5]">
        <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-3 space-y-2">
        {drivers.length ? drivers.map((driver) => (
          <div key={`${driver.dimension}-${driver.label}`} className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#f4efe5]">{driver.label}</p>
                <p className="mt-1 text-xs text-[#9aa7b8]">{driver.dimension}{driver.period ? ` / ${driver.period}` : ""}</p>
              </div>
              <p className="number shrink-0 text-sm font-semibold text-[#e1cb95]">{scoreLabel(driver.score, "N/A")}</p>
            </div>
            {isFiniteMetric(driver.value) ? <p className="number mt-2 text-xs text-[#c9d2df]">{formatNumber(driver.value, { maximumFractionDigits: 3 })}</p> : null}
          </div>
        )) : <p className="text-sm text-[#9aa7b8]">{emptyLabel}</p>}
      </div>
    </section>
  );
}

type ReportViewProps = { report: AnalysisReport; mode?: UiMode; locale?: Locale; previousReport?: AnalysisReport | null };

export function ReportView(props: ReportViewProps) {
  return <ReportViewWithLens key={`${props.report.id}:${props.report.investmentProfile}`} {...props} />;
}

function ReportViewWithLens({ report: sourceReport, mode = "pro", locale = "en", previousReport = null }: ReportViewProps) {
  const [analysisLens, setAnalysisLens] = useState<InvestmentProfile>(sourceReport.investmentProfile);
  const report = useMemo(() => applyAnalysisLens(sourceReport, analysisLens), [sourceReport, analysisLens]);
  const copy = getP0Copy(locale).report;
  const profilePresentation = profilePresentationFor(report.investmentProfile, locale);
  const profileDimensions = orderScoreDimensions(report.score.dimensions, report.investmentProfile);
  const extended = report.analysisType === "deep" || report.analysisType === "research";
  const showExplainability = mode === "pro";
  const showNumbers = mode === "pro";
  const showValuation = mode === "pro";
  const engine = report.engine;
  const growthBasis = engine?.metrics.growth.revenueGrowthBasis;
  const displayedMetricLabels = {
    ...metricLabelsFor(copy),
    revenueGrowth1y: growthBasis === "TTM_YOY" ? copy.metricLabels.revenueGrowthTtm : copy.metricLabels.revenueGrowthAnnual,
  };
  const scoreAvailable = report.score.score !== null;
  const researchView = localizedResearchView(researchViewForReport(report), locale);
  const neutralCopy = researchViewCopy(report, locale);
  const adminDiagnostics = adminQaSections(report.adminQa);
  const positiveDrivers = scoreDrivers(report, "positive");
  const negativeDrivers = scoreDrivers(report, "negative");
  const neutralDrivers = scoreDrivers(report, "neutral");
  const sharePrice = currentSharePrice(report);
  const latestDataTimestamp = engine?.diagnostics.financialFlowPeriodEnd
    ?? engine?.diagnostics.latestFinancialPeriodEnd
    ?? report.dataAsOf
    ?? null;
  return (
    <div className="space-y-5" data-report-print>
      <div data-report-brand className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-white/10 bg-[#081421] px-4 py-3 print:border-0 print:bg-transparent print:px-0 print:py-0">
        <div className="flex items-center gap-3">
          <StockBoxLogo size={72} alt="StockBox" className="h-14 w-14 print:h-12 print:w-12" />
          <div>
            <p className="serif text-xl font-semibold text-[#f4efe5]">StockBox</p>
            <p className="text-xs uppercase tracking-[0.16em] text-[#e1cb95]">{report.ticker} · {report.analysisType}</p>
          </div>
        </div>
        <div className="print:hidden">
          <ReportExportActions label={copy.exportPdf} hint={copy.exportPdfHint} />
        </div>
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
      <section aria-label={locale === "sv" ? "Investeringslins" : "Investment lens"}>
        <AnalysisLensControl
          value={analysisLens}
          defaultProfile={sourceReport.investmentProfile}
          lensScore={report.score.personalizedScore}
          locale={locale}
          onChange={setAnalysisLens}
        />
      </section>
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
            <p className="mt-3 max-w-3xl text-lg leading-8 text-[#d6deea]">{neutralCopy.oneSentence}</p>
          </div>
          <div className="grid min-w-56 grid-cols-2 gap-3 text-center">
            <div className="rounded-md border border-[#b99b5f]/30 bg-[#b99b5f]/10 p-4">
              <p className="text-xs text-[#e1cb95]">{copy.stockboxScore}</p>
              <p className={`${scoreAvailable ? "number text-4xl" : "text-lg"} mt-1 font-semibold text-[#f4efe5]`}>
                {scoreAvailable ? `${Math.round(report.score.score as number)}/100` : copy.noRating}
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
              <span>{locale === "sv" ? "Analyserad" : "Analyzed"}: {formatAnalysisTimestamp(report.generatedAt, locale)}</span>
               {report.modelVersion ? <span>{report.modelVersion}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[#e1cb95]">{copy.investmentCockpit}</p>
              <h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{copy.companySnapshot}</h2>
            </div>
            <Badge>{copy.latestDataTimestamp}: {latestDataTimestamp ?? copy.unavailable}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-[#9aa7b8]">{copy.currentSharePrice}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">
                {unavailableAwareCurrency(sharePrice.value, sharePrice.currency, copy.unavailable)}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-[#9aa7b8]">{copy.marketCap}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">
                {unavailableAwareCurrency(engine?.metrics.valuation.marketCap, report.reportingCurrency, copy.unavailable)}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-[#9aa7b8]">{copy.reportingCurrency}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{report.reportingCurrency ?? copy.unavailable}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3">
              <p className="text-xs text-[#9aa7b8]">{copy.engineVersion}</p>
              <p className="mt-1 text-sm font-semibold text-[#f4efe5]">{report.modelVersion ?? engine?.modelVersion ?? copy.unavailable}</p>
            </div>
          </div>
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-[#f4efe5]">{copy.scoreStack}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {profileDimensions.map((dimension) => (
                <div key={dimension.key} className="rounded-md border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs text-[#9aa7b8]">
                    <span>{dimension.label}</span>
                    <span className="number text-[#e1cb95]">{scoreLabel(dimension.score, copy.unavailable)}</span>
                  </div>
                  {isFiniteMetric(dimension.score) ? <Meter value={dimension.score} className="mt-2" /> : (
                    <p className="mt-2 text-xs text-[#9aa7b8]">{dimension.missingData?.[0]?.reason ?? copy.missingMetricReason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.modelAssessment}</h2>
            <Badge>{researchView}</Badge>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{neutralCopy.summary}</p>
          {report.score.score !== null && report.score.personalizedScore !== null ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Meter value={report.score.score} label={copy.generalScore} />
              <Meter value={report.score.personalizedScore} label={locale === "sv" ? "Lins-poäng" : "Lens score"} />
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

      {mode === "simple" && report.historical ? <HistoricalResearchView report={report} mode={mode} locale={locale} /> : null}

      <WhatChanged report={report} previousReport={previousReport} copy={copy} locale={locale} />

      {showExplainability ? <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.scoreDriverSnapshot}</h2>
            <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{copy.scoreContributionHint}</p>
          </div>
          <Badge>{positiveDrivers.length + negativeDrivers.length + neutralDrivers.length} {copy.contributors}</Badge>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <ScoreDriverList title={copy.positiveContributors} drivers={positiveDrivers} tone="positive" emptyLabel={copy.noPositiveDrivers} />
          <ScoreDriverList title={copy.negativeContributors} drivers={negativeDrivers} tone="negative" emptyLabel={copy.noNegativeDrivers} />
          <ScoreDriverList title={copy.neutralContributors} drivers={neutralDrivers.slice(0, 4)} tone="neutral" emptyLabel={copy.insufficientSignals} />
        </div>
      </Card> : null}

      {showExplainability ? <PeerBenchmarkLens report={report} copy={copy} /> : null}

      {showExplainability ? <AnalystExpectationsPanel report={report} copy={copy} /> : null}

      {showExplainability ? <Card>
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.explainability}</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <ScoreChart dimensions={profileDimensions} />
          <div className="space-y-3">
            {profileDimensions.map((dimension) => (
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

      {mode === "pro" && report.historical ? <HistoricalResearchView report={report} mode={mode} locale={locale} /> : null}

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

      {report.researchPlan ? <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#f4efe5]">
              <Compass className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
              {copy.whatToWatchNext}
            </h2>
            {report.researchPlan.nextSuggestedReview ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-[#9aa7b8]">
                <CalendarClock className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
                {copy.nextReview}: {report.researchPlan.nextSuggestedReview}
              </p>
            ) : null}
          </div>
          {report.researchPlan.valuationReviewZone ? <Badge>{copy.valuationReviewZone}: {report.researchPlan.valuationReviewZone}</Badge> : null}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <WatchSignalList title={copy.whatToWatchNext} items={report.researchPlan.whatToWatch} emptyLabel={copy.noWatchSignals} />
          <WatchSignalList title={copy.improveCase} items={report.researchPlan.improveCase} emptyLabel={copy.noWatchSignals} />
          <WatchSignalList title={copy.weakenCase} items={[...report.researchPlan.weakenCase, ...report.researchPlan.invalidationTriggers]} emptyLabel={copy.noWatchSignals} />
        </div>
      </Card> : null}

      {showExplainability ? <ResearchQuestionPanel report={report} locale={locale} /> : null}

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
        {engine?.dcf.status === "available" ? <ValuationScenarioLab dcf={engine.dcf} locale={locale} /> : null}
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
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-white/10 bg-[#081421]/80 p-3">
              <Database className="h-4 w-4 text-[#e1cb95]" aria-hidden="true" />
              <p className="mt-2 text-xs text-[#9aa7b8]">{copy.dataCoverage}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{formatPercent(report.dataCoverage ?? engine.dataCoverage, 0)}</p>
            </div>
            <div className="rounded-md border border-white/10 bg-[#081421]/80 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <p className="mt-2 text-xs text-[#9aa7b8]">{copy.confidence}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{report.score.confidence}%</p>
            </div>
            <div className="rounded-md border border-white/10 bg-[#081421]/80 p-3">
              <AlertCircle className="h-4 w-4 text-red-300" aria-hidden="true" />
              <p className="mt-2 text-xs text-[#9aa7b8]">{copy.missingData}</p>
              <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{engine.missingData.length}</p>
            </div>
          </div>
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
