import type { Metadata, Route } from "next";
import Link from "next/link";
import { Card, Container, Section } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ComparisonPicker, type ComparisonHistoryItem } from "@/components/analysis/comparison-picker";
import { comparisonGroups, objectiveDifferences, type ComparisonMetric } from "@/lib/analysis/comparison";
import type { AnalysisReport } from "@/lib/analysis/types";
import { formatAnalysisTimestamp } from "@/lib/analysis/timestamp";
import { localizedResearchView, researchViewForReport } from "@/lib/analysis/research-view";
import { captureServerEvent } from "@/lib/analytics/events";
import { getCurrentUser } from "@/lib/auth/session";
import { resolveCanonicalCompanySelection } from "@/lib/data/company-search";
import { searchCompanies } from "@/lib/data/provider";
import { getAnalysis, getUserAnalysisHistory } from "@/lib/db/repositories";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/types";
import { formatCompactCurrency, formatNumber, formatPercent } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Compare analyses" };
export const dynamic = "force-dynamic";

type ComparePageProps = { searchParams: Promise<{ id?: string | string[] }> };
const SUMMARY_KEYS = ["valuation", "growth", "profitability", "financialHealth", "quality", "risk", "momentum"] as const;

function requestedIds(value: string | string[] | undefined) {
  const ids = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(ids.filter(Boolean))];
}

function reportFromRow(row: Awaited<ReturnType<typeof getAnalysis>>) {
  return row?.report as AnalysisReport | undefined;
}

function unavailable(locale: Locale) {
  return locale === "sv" ? "Ej tillgängligt" : "Not available";
}

function metricValue(report: AnalysisReport, metric: ComparisonMetric, locale: Locale) {
  const value = metric.read(report);
  if (typeof value !== "number" || !Number.isFinite(value)) return unavailable(locale);
  if (metric.kind === "percent") return formatPercent(value, 1);
  if (metric.kind === "currency") return formatCompactCurrency(value, report.reportingCurrency ?? "USD");
  if (metric.kind === "multiple") return `${formatNumber(value, { maximumFractionDigits: 2 })}×`;
  return formatNumber(value, { maximumFractionDigits: 2 });
}

async function exchangeFor(report: AnalysisReport) {
  try {
    const candidates = await searchCompanies(report.ticker);
    const resolved = resolveCanonicalCompanySelection({
      ticker: report.ticker,
      canonicalTicker: report.ticker,
      name: report.companyName,
    }, candidates);
    return resolved.ok ? resolved.company.exchange ?? resolved.company.mic ?? null : null;
  } catch {
    return null;
  }
}

function idsHref(ids: string[]): Route {
  const search = new URLSearchParams();
  ids.forEach((id) => search.append("id", id));
  return `/compare${search.size ? `?${search.toString()}` : ""}` as Route;
}

function reportGridClass(count: number) {
  if (count === 2) return "grid grid-cols-2 gap-2";
  return "grid grid-cols-1 gap-2 min-[390px]:grid-cols-3";
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const [user, locale, params] = await Promise.all([getCurrentUser(), getLocale(), searchParams]);
  const sv = locale === "sv";
  const metadataLabels = sv
    ? { exchange: "Börs", engineVersion: "Motorversion", analysisDate: "Analysdatum" }
    : { exchange: "Exchange", engineVersion: "Engine version", analysisDate: "Analysis date" };
  if (!user) {
    return <Section><Container className="max-w-3xl"><Card>
      <h1 className="serif text-3xl font-semibold text-[#f4efe5]">{sv ? "Jämför analyser" : "Compare analyses"}</h1>
      <p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Logga in för att jämföra sparade StockBox-rapporter." : "Sign in to compare saved StockBox reports."}</p>
      <ButtonLink href="/auth/login" className="mt-5">{sv ? "Logga in" : "Log in"}</ButtonLink>
    </Card></Container></Section>;
  }

  const allIds = requestedIds(params.id);
  const ids = allIds.slice(0, 3);
  const history = await getUserAnalysisHistory({ userId: user.id, page: 1, pageSize: 50 });
  const available = (history.ok ? history.data : []) as ComparisonHistoryItem[];
  const loaded = await Promise.all(ids.map((id) => getAnalysis(id, user.id)));
  const reports = loaded.map(reportFromRow).filter((report): report is AnalysisReport => Boolean(report));
  const exchanges = await Promise.all(reports.map(exchangeFor));

  if (ids.length > 0) captureServerEvent("comparison_started", { userId: user.id, count: ids.length });
  if (reports.length >= 2) captureServerEvent("comparison_completed", { userId: user.id, count: reports.length });

  const differences = objectiveDifferences(reports, locale);
  const summaryKeys = SUMMARY_KEYS.filter((key) => reports.some((report) => report.score.dimensions.some((dimension) => dimension.key === key)));

  return <Section><Container>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-[#e1cb95]">Research comparison</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">{sv ? "Jämför StockBox-rapporter" : "Compare StockBox reports"}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{sv ? "Välj exakta sparade snapshots. Jämförelsen räknar inte om poäng, hämtar inte nya finansiella tal och ändrar inte historiska slutsatser." : "Choose exact saved snapshots. Comparison does not recalculate scores, fetch new financial numbers, or alter historical conclusions."}</p>
      </div>
      <Link href="/history" className="text-sm font-semibold text-[#e1cb95] hover:text-white">{sv ? "Analyshistorik →" : "Analysis history →"}</Link>
    </div>

    <div className="mt-8">
      <ComparisonPicker available={available} initialSelectedIds={ids} locale={locale} />
    </div>

    {allIds.length > 3 ? <p className="mt-3 text-sm text-amber-200">{sv ? "Max tre rapporter stöds. Endast de tre första valen används." : "A maximum of three reports is supported. Only the first three selections are used."}</p> : null}
    {ids.length > 0 && reports.length !== ids.length ? <Card className="mt-5 border-red-300/20 bg-red-950/15"><p className="text-sm text-red-200">{sv ? "Minst en vald rapport kunde inte läsas från ditt konto. Byt den rapporten i väljaren ovan." : "At least one selected report could not be loaded from your account. Change that report in the selector above."}</p></Card> : null}

    {reports.length >= 2 ? <div className="mt-8 space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">{sv ? "2. Valda snapshots" : "2. Selected snapshots"}</p>
        </div>
        <div className={reports.length === 2 ? "grid gap-0 md:grid-cols-[1fr_auto_1fr]" : "grid gap-0 md:grid-cols-3"}>
          {reports.map((report, index) => <div key={report.id} className="border-b border-white/10 p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-mono text-sm font-semibold text-[#e1cb95]">{report.ticker}</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{report.companyName}</h2></div>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#c9d2df]">{report.analysisType}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div><dt className="text-[#6f7b8c]">{metadataLabels.exchange}</dt><dd className="mt-1 text-[#c9d2df]">{exchanges[index] ?? unavailable(locale)}</dd></div>
              <div><dt className="text-[#6f7b8c]">{metadataLabels.engineVersion}</dt><dd className="mt-1 truncate text-[#c9d2df]">{report.modelVersion ?? unavailable(locale)}</dd></div>
              <div className="col-span-2"><dt className="text-[#6f7b8c]">{metadataLabels.analysisDate}</dt><dd className="mt-1 font-semibold text-[#f4efe5]">{formatAnalysisTimestamp(report.generatedAt, locale)}</dd></div>
              <div><dt className="text-[#6f7b8c]">Score</dt><dd className="number mt-1 text-lg font-semibold text-[#f4efe5]">{report.score.score === null ? unavailable(locale) : `${Math.round(report.score.score)}/100`}</dd></div>
              <div><dt className="text-[#6f7b8c]">{sv ? "Konfidens" : "Confidence"}</dt><dd className="number mt-1 text-lg font-semibold text-[#f4efe5]">{Math.round(report.score.confidence)}%</dd></div>
              <div><dt className="text-[#6f7b8c]">{sv ? "Täckning" : "Coverage"}</dt><dd className="number mt-1 text-[#c9d2df]">{report.dataCoverage === undefined ? unavailable(locale) : formatPercent(report.dataCoverage, 0)}</dd></div>
              <div><dt className="text-[#6f7b8c]">{sv ? "Modellbedömning" : "Model rating"}</dt><dd className="mt-1 font-semibold text-[#e1cb95]">{report.recommendation}</dd></div>
              <div><dt className="text-[#6f7b8c]">{sv ? "Researchvy" : "Research view"}</dt><dd className="mt-1 font-semibold text-[#e1cb95]">{localizedResearchView(researchViewForReport(report), locale)}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold"><Link href={`/analysis/${report.id}`} className="text-[#e1cb95] hover:text-white">{sv ? "Öppna full analys" : "Open full analysis"}</Link><Link href="#comparison-picker" className="text-[#9aa7b8] hover:text-white">{sv ? "Byt rapport" : "Change report"}</Link></div>
          </div>)}
          {reports.length === 2 ? <div className="hidden items-center px-3 text-xs font-bold tracking-[0.2em] text-[#6f7b8c] md:flex">VS</div> : null}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">{sv ? "Översikt" : "Summary"}</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{sv ? "Canonical scores sida vid sida" : "Canonical scores side by side"}</h2></div><span className="text-xs text-[#6f7b8c]">{sv ? "Inga separata comparison scores" : "No separate comparison scores"}</span></div>
        <div className="mt-5 space-y-3">
          {[{ key: "overall", label: "Overall Score" }, ...summaryKeys.map((key) => ({ key, label: reports.flatMap((report) => report.score.dimensions).find((dimension) => dimension.key === key)?.label ?? key }))].map((row) => <div key={row.key} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <p className="mb-2 text-xs font-semibold text-[#9aa7b8]">{row.label}</p>
            <div className={reportGridClass(reports.length)}>{reports.map((report) => {
              const value = row.key === "overall" ? report.score.score : report.score.dimensions.find((dimension) => dimension.key === row.key)?.score;
              return <div key={report.id} className="rounded-md bg-[#07111f] p-3"><span className="block font-mono text-[11px] text-[#e1cb95]">{report.ticker}</span><span className="number mt-1 block text-lg font-semibold text-[#f4efe5]">{value === null || value === undefined ? unavailable(locale) : Math.round(value)}</span></div>;
            })}</div>
          </div>)}
          <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3"><p className="mb-2 text-xs font-semibold text-[#9aa7b8]">{sv ? "Konfidens / täckning" : "Confidence / coverage"}</p><div className={reportGridClass(reports.length)}>{reports.map((report) => <div key={report.id} className="rounded-md bg-[#07111f] p-3 text-xs"><span className="font-mono text-[#e1cb95]">{report.ticker}</span><p className="mt-2 text-[#c9d2df]">{Math.round(report.score.confidence)}% {sv ? "konfidens" : "confidence"}</p><p className="mt-1 text-[#9aa7b8]">{report.dataCoverage === undefined ? unavailable(locale) : `${formatPercent(report.dataCoverage, 0)} ${sv ? "täckning" : "coverage"}`}</p></div>)}</div></div>
        </div>
      </Card>

      {comparisonGroups.map((group) => {
        const metrics = group.metrics.filter((metric) => reports.some((report) => typeof metric.read(report) === "number" && Number.isFinite(metric.read(report))));
        if (!metrics.length) return null;
        return <Card key={group.id}>
          <h2 className="text-xl font-semibold text-[#f4efe5]">{group.label}</h2>
          <div className="mt-4 space-y-2">{metrics.map((metric) => <div key={metric.key} className="rounded-lg border border-white/10 p-3"><p className="mb-2 text-xs font-semibold text-[#9aa7b8]">{metric.label}</p><div className={reportGridClass(reports.length)}>{reports.map((report) => <div key={report.id} className="rounded-md bg-white/[0.03] p-3"><span className="block font-mono text-[11px] text-[#e1cb95]">{report.ticker}</span><span className="number mt-1 block text-base font-semibold text-[#f4efe5]">{metricValue(report, metric, locale)}</span></div>)}</div></div>)}</div>
        </Card>;
      })}

      <Card>
        <h2 className="text-xl font-semibold text-[#f4efe5]">{sv ? "Styrkor och risker" : "Strengths and risks"}</h2>
        <div className={`mt-4 ${reports.length === 2 ? "grid gap-4 lg:grid-cols-2" : "grid gap-4 lg:grid-cols-3"}`}>{reports.map((report) => <div key={report.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
          <p className="font-mono text-xs font-semibold text-[#e1cb95]">{report.ticker}</p><h3 className="mt-1 font-semibold text-[#f4efe5]">{report.companyName}</h3>
          <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">{sv ? "Styrkor" : "Strengths"}</p><div className="mt-2 space-y-2">{report.greenFlags.length ? report.greenFlags.slice(0, 5).map((flag) => <div key={`${flag.title}-${flag.metric ?? ""}`}><p className="text-sm font-semibold text-[#f4efe5]">{flag.title}</p><p className="mt-1 text-xs leading-5 text-[#9aa7b8]">{flag.detail}</p></div>) : <p className="text-xs text-[#6f7b8c]">{sv ? "Inga registrerade styrkeflaggor i snapshoten." : "No recorded strength flags in this snapshot."}</p>}</div></div>
          <div className="mt-5 border-t border-white/10 pt-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-200">{sv ? "Risker" : "Risks"}</p><div className="mt-2 space-y-2">{report.redFlags.length ? report.redFlags.slice(0, 5).map((flag) => <div key={`${flag.title}-${flag.metric ?? ""}`}><p className="text-sm font-semibold text-[#f4efe5]">{flag.title}</p><p className="mt-1 text-xs leading-5 text-[#9aa7b8]">{flag.detail}</p></div>) : <p className="text-xs text-[#6f7b8c]">{sv ? "Inga registrerade riskflaggor i snapshoten." : "No recorded risk flags in this snapshot."}</p>}</div></div>
        </div>)}</div>
      </Card>

      {reports.length === 2 ? <Card>
        <h2 className="text-xl font-semibold text-[#f4efe5]">{sv ? "Vad sticker ut?" : "What stands out"}</h2>
        <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{sv ? "Endast objektiva skillnader från numeriska canonical metrics i de två valda snapshotsen visas." : "Only objective differences from numeric canonical metrics in the two selected snapshots are shown."}</p>
        {differences.length ? <ul className="mt-4 space-y-2">{differences.map((difference) => <li key={difference} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm leading-6 text-[#c9d2df]">{difference}</li>)}</ul> : <p className="mt-4 text-sm text-[#9aa7b8]">{sv ? "Inte tillräckligt med jämförbara canonical metrics för säkra skillnadsstatement." : "Not enough comparable canonical metrics for reliable difference statements."}</p>}
      </Card> : null}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#081421] p-4 text-sm">
        {reports.length === 2 ? <Link href={idsHref([ids[1], ids[0]])} className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Byt plats på bolagen" : "Swap companies"}</Link> : null}
        {reports.length < 3 ? <Link href="#comparison-picker" className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Lägg till en rapport" : "Add another report"}</Link> : null}
        <Link href="/compare" className="font-semibold text-[#9aa7b8] hover:text-white">{sv ? "Ny jämförelse" : "New comparison"}</Link>
        {reports.map((report, index) => <Link key={report.id} href={idsHref(ids.filter((_, candidateIndex) => candidateIndex !== index))} className="text-xs font-semibold text-[#9aa7b8] hover:text-white">{sv ? "Ta bort" : "Remove"} {report.ticker}</Link>)}
      </div>
    </div> : <Card className="mt-8">
      <h2 className="text-lg font-semibold text-[#f4efe5]">{sv ? "Jämför bolag" : "Compare companies"}</h2>
      <p className="mt-2 text-sm leading-6 text-[#9aa7b8]">{reports.length === 1 ? (sv ? "En rapport är vald. Sök efter ett andra bolag eller välj en annan tidigare StockBox-rapport ovan." : "One report is selected. Search for a second company or choose another previous StockBox report above.") : (sv ? "Sök efter två bolag eller välj tidigare StockBox-rapporter för att börja." : "Search for two companies or select previous StockBox reports to begin.")}</p>
    </Card>}
  </Container></Section>;
}
