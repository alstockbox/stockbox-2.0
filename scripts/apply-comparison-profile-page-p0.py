from pathlib import Path

path = Path("src/app/compare/page.tsx")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"guard failed: expected 1 match, found {count}: {old[:100]!r}")
    text = text.replace(old, new, 1)


replace_once(
    'import { comparisonGroups, objectiveDifferences, type ComparisonMetric } from "@/lib/analysis/comparison";',
    '''import {
  comparisonGroups,
  comparisonLensForProfile,
  comparisonWarnings,
  objectiveDifferences,
  resolveComparisonProfile,
  type ComparisonMetric,
} from "@/lib/analysis/comparison";''',
)

replace_once(
    '''function metricValue(report: AnalysisReport, metric: ComparisonMetric, locale: Locale) {
  const value = metric.read(report);
  if (typeof value !== "number" || !Number.isFinite(value)) return unavailable(locale);
  if (metric.kind === "percent") return formatPercent(value, 1);
  if (metric.kind === "currency") return formatCompactCurrency(value, report.reportingCurrency ?? "USD");
  if (metric.kind === "multiple") return `${formatNumber(value, { maximumFractionDigits: 2 })}×`;
  return formatNumber(value, { maximumFractionDigits: 2 });
}
''',
    '''function metricValue(report: AnalysisReport, metric: ComparisonMetric, locale: Locale) {
  const value = metric.read(report);
  if (typeof value !== "number" || !Number.isFinite(value)) return unavailable(locale);
  if (metric.kind === "percent") return formatPercent(value, 1);
  if (metric.kind === "currency") return formatCompactCurrency(value, report.reportingCurrency ?? "USD");
  if (metric.kind === "multiple") return `${formatNumber(value, { maximumFractionDigits: 2 })}×`;
  return formatNumber(value, { maximumFractionDigits: 2 });
}

function metricDirectionLabel(metric: ComparisonMetric, locale: Locale) {
  if (metric.direction === "contextual") return locale === "sv" ? "Kontextuellt — ingen automatisk vinnare" : "Contextual — no automatic winner";
  if (metric.direction === "higher_is_better") return locale === "sv" ? "Högre är normalt starkare" : "Higher is generally stronger";
  if (metric.direction === "lower_is_better") return locale === "sv" ? "Lägre är normalt starkare" : "Lower is generally stronger";
  return locale === "sv" ? "Ingen generell ranking" : "No general ranking";
}
''',
)

replace_once(
    '''  const differences = objectiveDifferences(reports, locale);
  const summaryKeys = SUMMARY_KEYS.filter((key) => reports.some((report) => report.score.dimensions.some((dimension) => dimension.key === key)));
''',
    '''  const resolvedComparisonProfile = resolveComparisonProfile(reports);
  const comparisonLens = comparisonLensForProfile(resolvedComparisonProfile.profile);
  const warnings = comparisonWarnings(reports, locale);
  const orderedComparisonGroups = comparisonLens.groupOrder.flatMap((groupId) => {
    const group = comparisonGroups.find((candidate) => candidate.id === groupId);
    return group ? [group] : [];
  });
  const differences = objectiveDifferences(reports, locale, resolvedComparisonProfile.profile);
  const summaryKeys = SUMMARY_KEYS.filter((key) => reports.some((report) => report.score.dimensions.some((dimension) => dimension.key === key)));
''',
)

replace_once(
    '''    {reports.length >= 2 ? <div className="mt-8 space-y-6">
      <Card className="overflow-hidden p-0">''',
    '''    {reports.length >= 2 ? <div className="mt-8 space-y-6">
      <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/[0.035]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">{sv ? "Jämförelselins" : "Comparison lens"}</p>
            <h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{comparisonLens.label}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#c9d2df]">{comparisonLens.description}</p>
          </div>
          <span className="rounded-full border border-[#b99b5f]/30 bg-[#b99b5f]/10 px-3 py-1.5 text-xs font-semibold text-[#e1cb95]">{comparisonLens.profile.replaceAll("_", " ")}</span>
        </div>
        {resolvedComparisonProfile.mixed ? (
          <p className="mt-4 rounded-md border border-amber-200/20 bg-amber-200/5 p-3 text-sm leading-6 text-amber-100">
            {sv ? "Blandade profilsnapshots: Balanced-linsen används för jämförelsens ordning och stand-out-signaler. De sparade canonical scores ändras eller räknas inte om." : "Mixed profile snapshots: the Balanced lens is used for comparison ordering and stand-out signals. Saved canonical scores are not changed or recalculated."}
          </p>
        ) : (
          <p className="mt-4 text-xs leading-5 text-[#9aa7b8]">{sv ? "Alla valda snapshots använder samma investeringsprofil." : "All selected snapshots use the same investment profile."}</p>
        )}
        {warnings.length ? <div className="mt-3 space-y-2">{warnings.map((warning) => <p key={warning} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-[#c9d2df]">{warning}</p>)}</div> : null}
      </Card>

      <Card className="overflow-hidden p-0">''',
)

replace_once(
    '''      {comparisonGroups.map((group) => {''',
    '''      {orderedComparisonGroups.map((group) => {''',
)

replace_once(
    '''          <div className="mt-4 space-y-2">{metrics.map((metric) => <div key={metric.key} className="rounded-lg border border-white/10 p-3"><p className="mb-2 text-xs font-semibold text-[#9aa7b8]">{metric.label}</p><div className={reportGridClass(reports.length)}>{reports.map((report) => <div key={report.id} className="rounded-md bg-white/[0.03] p-3"><span className="block font-mono text-[11px] text-[#e1cb95]">{report.ticker}</span><span className="number mt-1 block text-base font-semibold text-[#f4efe5]">{metricValue(report, metric, locale)}</span></div>)}</div></div>)}</div>''',
    '''          <div className="mt-4 space-y-2">{metrics.map((metric) => <div key={metric.key} className="rounded-lg border border-white/10 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[#9aa7b8]">{metric.label}</p><span className="text-[11px] text-[#6f7b8c]">{metricDirectionLabel(metric, locale)}</span></div><div className={reportGridClass(reports.length)}>{reports.map((report) => <div key={report.id} className="rounded-md bg-white/[0.03] p-3"><span className="block font-mono text-[11px] text-[#e1cb95]">{report.ticker}</span><span className="number mt-1 block text-base font-semibold text-[#f4efe5]">{metricValue(report, metric, locale)}</span></div>)}</div></div>)}</div>''',
)

path.write_text(text)
print("comparison profile page P0 patch applied")
