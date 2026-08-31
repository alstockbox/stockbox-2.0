import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AnalysisReport } from "@/lib/analysis/types";
import type { Locale } from "@/lib/i18n/types";
import { buildCompositeFairValue } from "@/lib/investor-intelligence/fair-value";
import { buildHistoricalValuationSummary, type HistoricalValuationStatistics } from "@/lib/investor-intelligence/historical-valuation";
import { formatCompactCurrency, formatPercent } from "@/lib/utils/format";

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statsForDisplay(metric: ReturnType<typeof buildHistoricalValuationSummary>["metrics"]["pe"]) {
  return metric.windows.tenYear ?? metric.windows.fiveYear ?? metric.windows.threeYear ?? metric.windows.max;
}

function horizon(metric: ReturnType<typeof buildHistoricalValuationSummary>["metrics"]["pe"]) {
  if (metric.windows.tenYear) return "10Y";
  if (metric.windows.fiveYear) return "5Y";
  if (metric.windows.threeYear) return "3Y";
  if (metric.windows.max) return "MAX";
  return null;
}

function multiple(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}×` : "—";
}

function percentile(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}th` : "—";
}

function HistoricalMetricCard({ label, stats }: { label: string; stats: HistoricalValuationStatistics | null }) {
  return <div className="rounded-md border border-white/10 bg-white/5 p-3">
    <p className="text-xs text-[#9aa7b8]">{label}</p>
    <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{multiple(stats?.current)}</p>
    <p className="mt-2 text-xs text-[#c9d2df]">Median {multiple(stats?.median)} · percentile {percentile(stats?.currentPercentile)}</p>
    <p className="mt-1 text-xs text-[#9aa7b8]">Vs median {stats?.differenceVsMedian === null || stats?.differenceVsMedian === undefined ? "—" : formatPercent(stats.differenceVsMedian, 1)} · n={stats?.observations ?? 0}</p>
  </div>;
}

export function InvestorValuationSummary({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const valuation = report.engine?.metrics?.valuation;
  const cashFlow = report.engine?.metrics?.cashFlow;
  const historical = buildHistoricalValuationSummary({
    financials: report.historical?.financials ?? [],
    current: {
      pe: finite(valuation?.priceEarnings),
      ps: finite(valuation?.priceSales),
      fcfYield: finite(valuation?.freeCashFlowYield ?? report.metrics.fcfYield),
      dividendYield: finite(cashFlow?.dividendYield),
    },
  });
  const peStats = statsForDisplay(historical.metrics.pe);
  const peHorizon = horizon(historical.metrics.pe);
  const latest = [...(report.historical?.financials ?? [])].sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
  const currentEps = finite(latest?.eps);
  const historicalImplied = peStats && currentEps !== null && currentEps > 0 ? peStats.median * currentEps : null;
  const dcfAvailable = report.engine?.dcf.status === "available";
  const dcfBase = dcfAvailable ? finite(report.engine?.dcf.mid) : report.dcf.suitable ? finite(report.dcf.base) : null;
  const dcfLow = dcfAvailable ? finite(report.engine?.dcf.low) : report.dcf.suitable ? finite(report.dcf.bear) : null;
  const dcfHigh = dcfAvailable ? finite(report.engine?.dcf.high) : report.dcf.suitable ? finite(report.dcf.bull) : null;
  const currentPrice = finite(report.market?.price ?? report.engine?.dcf.currentPrice);
  const composite = buildCompositeFairValue({
    currentPrice,
    methods: [
      { method: "DCF", impliedValue: dcfBase, low: dcfLow, high: dcfHigh, baseWeight: 0.6, confidence: Math.min(1, Math.max(0, (report.score.confidence ?? 0) / 100)), unavailableReason: "DCF is unavailable or inappropriate for this company." },
      { method: "HISTORICAL_MULTIPLE", impliedValue: historicalImplied, low: null, high: null, baseWeight: 0.4, confidence: Math.min(1, (peStats?.observations ?? 0) / 10), unavailableReason: "A supported historical P/E median and positive current EPS are required." },
      { method: "PEER", impliedValue: null, low: null, high: null, baseWeight: 0.2, confidence: 0, unavailableReason: "Real peer valuation is not yet available for this report." },
      { method: "FORWARD_EARNINGS", impliedValue: null, low: null, high: null, baseWeight: 0.15, confidence: 0, unavailableReason: "Forward consensus price inputs are unavailable for this report." },
    ],
  });
  const currency = report.market?.currency ?? report.reportingCurrency ?? report.engine?.dcf.currency ?? undefined;
  const sv = locale === "sv";

  return <div id="historical" className="space-y-5">
    <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">FAIR VALUE V2</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{sv ? "Transparent sammansatt värdering" : "Transparent composite valuation"}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">{sv ? "Endast värderingsmetoder med riktiga, kompatibla inputs ingår. Saknade metoder omfördelar vikten i stället för att fyllas med antagna värden." : "Only valuation methods with real, compatible inputs are included. Missing methods reallocate weight rather than being filled with assumed values."}</p></div><Badge>{composite.status}</Badge></div>
      {composite.status === "available" ? <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><p className="text-xs text-[#9aa7b8]">Current price</p><p className="number mt-1 text-xl font-semibold">{currentPrice === null ? "—" : formatCompactCurrency(currentPrice, currency)}</p></div>
          <div><p className="text-xs text-[#9aa7b8]">Fair value</p><p className="number mt-1 text-xl font-semibold text-[#e1cb95]">{composite.fairValue === null ? "—" : formatCompactCurrency(composite.fairValue, currency)}</p></div>
          <div><p className="text-xs text-[#9aa7b8]">Upside / downside</p><p className="number mt-1 text-xl font-semibold">{composite.upsideDownside === null ? "—" : formatPercent(composite.upsideDownside, 1)}</p></div>
          <div><p className="text-xs text-[#9aa7b8]">Margin of safety</p><p className="number mt-1 text-xl font-semibold">{composite.marginOfSafety === null ? "—" : formatPercent(composite.marginOfSafety, 1)}</p></div>
          <div><p className="text-xs text-[#9aa7b8]">Confidence</p><p className="number mt-1 text-xl font-semibold">{composite.confidence === null ? "—" : formatPercent(composite.confidence, 0)}</p></div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-md border border-white/10"><table className="min-w-full text-left text-xs"><thead><tr>{["Method","Implied value","Weight","Confidence"].map((heading) => <th key={heading} className="border-b border-white/10 px-3 py-2 text-[#e1cb95]">{heading}</th>)}</tr></thead><tbody>{composite.methodsUsed.map((method) => <tr key={method.method}><td className="border-b border-white/5 px-3 py-2 text-[#f4efe5]">{method.method}</td><td className="border-b border-white/5 px-3 py-2">{formatCompactCurrency(method.impliedValue, currency)}</td><td className="border-b border-white/5 px-3 py-2">{formatPercent(method.weight, 0)}</td><td className="border-b border-white/5 px-3 py-2">{formatPercent(method.confidence, 0)}</td></tr>)}</tbody></table></div>
      </> : <p className="mt-4 text-sm text-[#9aa7b8]">No compatible fair-value method is currently available.</p>}
      {composite.unavailableMethods.length ? <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-[#e1cb95]">Unavailable methods</summary><ul className="mt-2 space-y-1 text-xs text-[#9aa7b8]">{composite.unavailableMethods.map((item) => <li key={item.method}>{item.method}: {item.reason}</li>)}</ul></details> : null}
    </Card>

    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">HISTORICAL VALUATION V2</p><h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{sv ? "Värdering relativt bolagets egen historik" : "Valuation relative to the company's own history"}</h2></div><Badge>{peHorizon ?? "insufficient history"}</Badge></div>
      <p className="mt-2 text-sm text-[#9aa7b8]">{sv ? "Percentiler och medianer beräknas endast från år där kompatibla historiska inputs finns. Detta är relativ värderingskontext, inte ett påstående om intrinsiskt värde." : "Percentiles and medians use only years with compatible historical inputs. This is relative valuation context, not a claim of intrinsic value."}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HistoricalMetricCard label="P/E" stats={statsForDisplay(historical.metrics.pe)} />
        <HistoricalMetricCard label="P/S" stats={statsForDisplay(historical.metrics.ps)} />
        <HistoricalMetricCard label="P/FCF" stats={statsForDisplay(historical.metrics.pFcf)} />
        <div className="rounded-md border border-white/10 bg-white/5 p-3"><p className="text-xs text-[#9aa7b8]">Implied price at historical median P/E</p><p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{historicalImplied === null ? "—" : formatCompactCurrency(historicalImplied, currency)}</p><p className="mt-2 text-xs text-[#9aa7b8]">{peHorizon ? `${peHorizon} median × latest supported EPS` : "Insufficient compatible history"}. Not intrinsic value.</p></div>
      </div>
    </Card>
  </div>;
}
