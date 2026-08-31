from pathlib import Path

comparison_path = Path("src/lib/analysis/comparison.ts")
comparison = comparison_path.read_text()
old_signature = 'export function comparisonWarnings(reports: AnalysisReport[], locale: "en" | "sv" = "en"): string[] {'
new_signature = '''export type ComparisonWarningOptions = {
  fxNormalized?: boolean;
  fxTargetCurrency?: string;
};

export function comparisonWarnings(
  reports: AnalysisReport[],
  locale: "en" | "sv" = "en",
  options: ComparisonWarningOptions = {},
): string[] {'''
if old_signature in comparison:
    comparison = comparison.replace(old_signature, new_signature, 1)
elif new_signature not in comparison:
    raise SystemExit("comparisonWarnings signature anchor not found")

old_currency = '''  if (currencies.length > 1) {
    warnings.push(locale === "sv"
      ? "Valda snapshots använder olika rapporteringsvalutor. Valutadenominerade värden visas i respektive native valuta och rankas inte direkt mot varandra."
      : "Selected snapshots use different reporting currencies. Currency-denominated values stay in native currency and are not ranked directly against each other.");
  }'''
new_currency = '''  if (currencies.length > 1) {
    if (options.fxNormalized) {
      const target = options.fxTargetCurrency ?? "EUR";
      warnings.push(locale === "sv"
        ? `Valda snapshots använder olika rapporteringsvalutor. Valutadenominerade värden visas i native valuta med en extra ${target}-normalisering från ECB:s referenskurser på eller före respektive snapshot-datum. Source: ECB statistics.`
        : `Selected snapshots use different reporting currencies. Currency-denominated values stay in native currency with an additional ${target} normalization from ECB reference rates on or before each snapshot date. Source: ECB statistics.`);
    } else {
      warnings.push(locale === "sv"
        ? "Valda snapshots använder olika rapporteringsvalutor. Valutadenominerade värden visas i respektive native valuta och rankas inte direkt mot varandra."
        : "Selected snapshots use different reporting currencies. Currency-denominated values stay in native currency and are not ranked directly against each other.");
    }
  }'''
if old_currency in comparison:
    comparison = comparison.replace(old_currency, new_currency, 1)
elif new_currency not in comparison:
    raise SystemExit("currency warning anchor not found")
comparison_path.write_text(comparison)

page_path = Path("src/app/compare/page.tsx")
page = page_path.read_text()
old_import = 'import { searchCompanies } from "@/lib/data/provider";\n'
new_import = '''import { searchCompanies } from "@/lib/data/provider";
import {
  convertWithComparisonFxContext,
  resolveComparisonFxContexts,
  type ComparisonFxContext,
} from "@/lib/data/ecb-fx";
'''
if old_import in page and 'resolveComparisonFxContexts' not in page:
    page = page.replace(old_import, new_import, 1)
elif 'resolveComparisonFxContexts' not in page:
    raise SystemExit("compare page import anchor not found")

old_metric = '''function metricValue(report: AnalysisReport, metric: ComparisonMetric, locale: Locale) {
  const value = metric.read(report);
  if (typeof value !== "number" || !Number.isFinite(value)) return unavailable(locale);
  if (metric.kind === "percent") return formatPercent(value, 1);
  if (metric.kind === "currency") return formatCompactCurrency(value, report.reportingCurrency ?? "USD");
  if (metric.kind === "multiple") return `${formatNumber(value, { maximumFractionDigits: 2 })}×`;
  return formatNumber(value, { maximumFractionDigits: 2 });
}'''
new_metric = '''function metricValue(
  report: AnalysisReport,
  metric: ComparisonMetric,
  locale: Locale,
  fxContext?: ComparisonFxContext,
) {
  const value = metric.read(report);
  if (typeof value !== "number" || !Number.isFinite(value)) return unavailable(locale);
  if (metric.kind === "percent") return formatPercent(value, 1);
  if (metric.kind === "currency") {
    const native = formatCompactCurrency(value, report.reportingCurrency ?? "USD");
    const normalized = convertWithComparisonFxContext(value, fxContext);
    if (normalized === null || !fxContext || fxContext.status !== "normalized") return native;
    return `${native} · ≈ ${formatCompactCurrency(normalized, fxContext.targetCurrency)}`;
  }
  if (metric.kind === "multiple") return `${formatNumber(value, { maximumFractionDigits: 2 })}×`;
  return formatNumber(value, { maximumFractionDigits: 2 });
}'''
if old_metric in page:
    page = page.replace(old_metric, new_metric, 1)
elif new_metric not in page:
    raise SystemExit("metricValue anchor not found")

old_load = '''  const reports = loaded.map(reportFromRow).filter((report): report is AnalysisReport => Boolean(report));
  const exchanges = await Promise.all(reports.map(exchangeFor));

  if (ids.length > 0) captureServerEvent("comparison_started", { userId: user.id, count: ids.length });'''
new_load = '''  const reports = loaded.map(reportFromRow).filter((report): report is AnalysisReport => Boolean(report));
  const exchanges = await Promise.all(reports.map(exchangeFor));
  const currencies = [...new Set(reports.map((report) => report.reportingCurrency).filter((currency): currency is string => Boolean(currency)))];
  const mixedCurrencies = currencies.length > 1;
  const fxContexts = mixedCurrencies
    ? await resolveComparisonFxContexts(reports.map((report) => ({
        id: report.id,
        currency: report.reportingCurrency,
        date: report.generatedAt,
      })), "EUR")
    : new Map<string, ComparisonFxContext>();
  const fxNormalized = mixedCurrencies && reports.every((report) => {
    const context = fxContexts.get(report.id);
    return context?.status === "normalized" || context?.status === "same_currency";
  });

  if (ids.length > 0) captureServerEvent("comparison_started", { userId: user.id, count: ids.length });'''
if old_load in page:
    page = page.replace(old_load, new_load, 1)
elif new_load not in page:
    raise SystemExit("comparison loading anchor not found")

old_warning_call = '  const warnings = comparisonWarnings(reports, locale);'
new_warning_call = '  const warnings = comparisonWarnings(reports, locale, { fxNormalized, fxTargetCurrency: "EUR" });'
if old_warning_call in page:
    page = page.replace(old_warning_call, new_warning_call, 1)
elif new_warning_call not in page:
    raise SystemExit("warning call anchor not found")

old_warning_ui = '''        {warnings.length ? <div className="mt-3 space-y-2">{warnings.map((warning) => <p key={warning} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-[#c9d2df]">{warning}</p>)}</div> : null}
      </Card>'''
new_warning_ui = '''        {warnings.length ? <div className="mt-3 space-y-2">{warnings.map((warning) => <p key={warning} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-[#c9d2df]">{warning}</p>)}</div> : null}
        {mixedCurrencies ? <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs leading-5 text-[#9aa7b8]">
          {fxNormalized ? <>
            <p>{sv ? "FX-normalisering: native belopp behålls och kompletteras med ungefärlig EUR vid ECB:s senaste referenskurs på eller före varje snapshot-datum." : "FX normalization: native amounts are preserved and supplemented with approximate EUR at the latest ECB reference rate on or before each snapshot date."}</p>
            <p className="mt-1">{reports.map((report) => {
              const context = fxContexts.get(report.id);
              return context ? `${report.ticker}: ${context.sourceCurrency}→${context.targetCurrency} @ ${context.rateDate ?? "N/A"}` : `${report.ticker}: FX N/A`;
            }).join(" · ")}</p>
            <p className="mt-1">Source: ECB statistics. {sv ? "EUR-beloppen är härledda jämförelsevärden, inte transaktionskurser." : "EUR amounts are derived comparison values, not transaction rates."}</p>
          </> : <p>{sv ? "FX-normalisering kunde inte verifieras för alla snapshots. Native valuta visas och ingen EUR-siffra fabriceras. Source: ECB statistics." : "FX normalization could not be verified for every snapshot. Native currency is shown and no EUR value is fabricated. Source: ECB statistics."}</p>}
        </div> : null}
      </Card>'''
if old_warning_ui in page:
    page = page.replace(old_warning_ui, new_warning_ui, 1)
elif new_warning_ui not in page:
    raise SystemExit("warning UI anchor not found")

old_metric_call = '{metricValue(report, metric, locale)}'
new_metric_call = '{metricValue(report, metric, locale, fxContexts.get(report.id))}'
if old_metric_call in page:
    page = page.replace(old_metric_call, new_metric_call)
elif new_metric_call not in page:
    raise SystemExit("metric render anchor not found")

page_path.write_text(page)
