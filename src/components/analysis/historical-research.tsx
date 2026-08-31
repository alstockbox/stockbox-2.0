import type { ReactNode } from "react";
import type {
  AnalysisReport,
  HistoricalCoverageItem,
  HistoricalFinancialPoint,
  HistoricalValuationPoint,
  HistoricalValuationWindowStats,
  UiMode,
} from "@/lib/analysis/types";
import type { Locale } from "@/lib/i18n/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FinancialDataExportButton } from "./financial-data-export-button";
import {
  buildGrowthDashboardRows,
  buildMarginDashboardRows,
  type HistoricalTrendClassification,
} from "@/lib/analysis/historical-dashboard";
import { HistoricalChartExplorer } from "./historical-chart-explorer";

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function copyFor(locale: Locale) {
  if (locale === "sv") return {
    historicalContext: "Historisk utveckling", priceHistory: "Prishistorik",
    growthHistory: "Tillväxt- & lönsamhetshistorik", balanceHistory: "Balansräkningshistorik",
    growthDashboard: "Tillväxtdashboard", marginDashboard: "Marginalanalys",
    valuationHistory: "Historisk värdering", dividendSnapshot: "Utdelningsöversikt",
    dividendHistory: "Utdelningshistorik", unavailable: "Saknas", notMeaningful: "Ej meningsfullt",
    fiscalYear: "År", revenue: "Omsättning", revenueGrowth: "Omsättningstillväxt",
    eps: "EPS", epsGrowth: "EPS-tillväxt", netIncome: "Nettoresultat", fcf: "FCF",
    fcfMargin: "FCF-marginal", operatingMargin: "Rörelsemarginal", roe: "ROE", roic: "ROIC",
    cash: "Kassa", debt: "Skuld", netDebt: "Nettoskuld", debtEquity: "Skuld/eget kapital",
    currentRatio: "Current ratio", shares: "Aktier", shareGrowth: "Aktieförändring",
    metric: "Mått",
    oneYear: "1 år", threeYearCagr: "3 år CAGR", fiveYearCagr: "5 år CAGR", tenYearCagr: "10 år CAGR",
    current: "Nu", oneYearAgo: "1 år sedan", threeYearAverage: "3-årssnitt", fiveYearAverage: "5-årssnitt",
    classification: "Klassning", accelerating: "Accelererande", decelerating: "Bromsande",
    stable: "Stabilt", volatile: "Volatilt",
    downloadCsv: "Ladda ner CSV",
  };
  return {
    historicalContext: "Historical context", priceHistory: "Price history",
    growthHistory: "Growth & profitability history", balanceHistory: "Balance sheet history",
    growthDashboard: "Growth dashboard", marginDashboard: "Margin analysis",
    valuationHistory: "Historical valuation", dividendSnapshot: "Dividend snapshot",
    dividendHistory: "Dividend history", unavailable: "Unavailable", notMeaningful: "Not meaningful",
    fiscalYear: "FY", revenue: "Revenue", revenueGrowth: "Revenue growth",
    eps: "EPS", epsGrowth: "EPS growth", netIncome: "Net income", fcf: "FCF",
    fcfMargin: "FCF margin", operatingMargin: "Operating margin", roe: "ROE", roic: "ROIC",
    cash: "Cash", debt: "Debt", netDebt: "Net debt", debtEquity: "Debt / equity",
    currentRatio: "Current ratio", shares: "Shares", shareGrowth: "Share growth",
    metric: "Metric",
    oneYear: "1Y", threeYearCagr: "3Y CAGR", fiveYearCagr: "5Y CAGR", tenYearCagr: "10Y CAGR",
    current: "Current", oneYearAgo: "1Y ago", threeYearAverage: "3Y avg", fiveYearAverage: "5Y avg",
    classification: "Classification", accelerating: "Accelerating", decelerating: "Decelerating",
    stable: "Stable", volatile: "Volatile",
    downloadCsv: "Download CSV",
  };
}
function localeTag(locale: Locale) {
  return locale === "sv" ? "sv-SE" : "en-US";
}

function formatPercent(value: number | null, locale: Locale, unavailable: string) {
  if (!isNumber(value)) return unavailable;
  return new Intl.NumberFormat(localeTag(locale), {
    style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1,
  }).format(value);
}

function formatNumber(value: number | null, locale: Locale, unavailable: string, digits = 2) {
  if (!isNumber(value)) return unavailable;
  return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: digits }).format(value);
}

function formatMoney(
  value: number | null,
  currency: string | null | undefined,
  locale: Locale,
  unavailable: string,
  compact = true,
) {
  if (!isNumber(value)) return unavailable;
  try {
    return new Intl.NumberFormat(localeTag(locale), {
      style: "currency", currency: currency || "USD", notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
    }).format(value);
  } catch {
    return formatNumber(value, locale, unavailable);
  }
}
type ChartPoint = { label: string; value: number | null };

function LineChart({ points, label, unavailable }: { points: ChartPoint[]; label: string; unavailable: string }) {
  const values = points.filter((point): point is { label: string; value: number } => isNumber(point.value));
  if (values.length < 2) return <p className="text-sm text-[#9aa7b8]">{unavailable}</p>;
  const width = 640;
  const height = 180;
  const paddingX = 24;
  const paddingY = 18;
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const coords = values.map((point, index) => ({
    ...point,
    x: paddingX + (index / (values.length - 1)) * (width - paddingX * 2),
    y: height - paddingY - ((point.value - min) / range) * (height - paddingY * 2),
  }));
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="h-44 w-full text-[#e1cb95]">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-xs text-[#9aa7b8]">
        <span>{coords[0]?.label}</span><span>{coords.at(-1)?.label}</span>
      </div>
    </div>
  );
}
function extraCopyFor(locale: Locale) {
  return locale === "sv" ? {
    revenueCagr3y: "Omsättning CAGR 3 år", revenueCagr10y: "Omsättning CAGR 10 år",
    epsCagr3y: "EPS CAGR 3 år", epsCagr10y: "EPS CAGR 10 år",
    dividendCagr3y: "Utdelning CAGR 3 år", dividendCagr5y: "Utdelning CAGR 5 år",
    dividendCagr10y: "Utdelning CAGR 10 år", yearsIncreased: "År med höjd utdelning",
    yearsUnchanged: "Oförändrade år", yearsCut: "År med sänkt utdelning",
    latestYield: "Senaste direktavkastning", latestDps: "Senaste utdelning/aktie",
    payout: "Payout", fcfPayout: "FCF payout", historicalPe: "Historiskt P/E",
    referencePrice: "Referenspris", dividendYield: "Direktavkastning", dividendPerShare: "Utdelning/aktie",
    currentPe: "P/E nu", historicalPeMedian: "Historisk median P/E", peVsHistory: "Mot historisk median",
    tenYearPeMedian: "10 års median P/E", currentYield: "Direktavkastning nu", historicalYieldAverage: "Historiskt snitt yield",
    ttmEps: "TTM EPS", ttmDividend: "TTM utdelning/aktie", valuationDate: "Datum", insufficientHistory: "Otillräcklig historik",
    discountQuality: "Historisk rabattkvalitet", discountVsHistoricalMedian: "Rabatt mot historisk median",
    evidenceCoverage: "Evidenstäckning", deteriorationScore: "Försämringspoäng", notApplicable: "Ej tillämpligt",
    signalEvidence: "Deterministiska signaler", historicalSnapshot: "Historisk översikt",
    currentColumn: "Nu", oneYearColumn: "1 år", threeYearColumn: "3 år", fiveYearColumn: "5 år", tenYearColumn: "10 år", maxColumn: "MAX",
    dividendGrowth: "Utdelningstillväxt", snapshotNote: "Nu visar senaste nivå där det är relevant. Horisonter visar tillväxt eller historisk median/snitt. MAX använder längsta verifierade historik och märker aldrig kortare historik som 10 år.",
    priceContext: "Priskontext", currentPrice: "Aktuell kurs", yearHigh: "52V högsta", yearLow: "52V lägsta",
    threeYearRange: "3 år intervall", fiveYearRange: "5 år intervall", tenYearRange: "10 år intervall", maxRange: "MAX intervall",
    below: "under", above: "över", priceContextNote: "52-veckorsintervallet använder providerdata när den är komplett, annars verifierad 1-årshistorik. Flerårsintervall visas bara när faktisk tidsbredd är tillräcklig.",
    paymentFrequency: "Betalningsfrekvens", latestPayment: "Senaste betalning", increaseStreak: "Höjningssvit", dividendSafety: "Utdelningssäkerhet", coverage: "Täckning",
    monthly: "Månadsvis", quarterly: "Kvartalsvis", semiannual: "Halvårsvis", annual: "Årlig", irregular: "Oregelbunden", none: "Ingen", unknown: "Okänd",
    covered: "Täckt", stretched: "Ansträngd", notCovered: "Ej täckt", insufficient: "Otillräckligt underlag", events: "event",
    historicalCoverage: "Historisk täckning", financialsCoverage: "Finansiell historik", priceCoverage: "Prishistorik", valuationCoverage: "Värderingshistorik", dividendCoverage: "Utdelningshistorik",
    coverageSeparate: "Täckning är separat från modellens konfidens", fullCoverage: "Full täckning", partialCoverage: "Otillräcklig historik", unavailableCoverage: "Saknas", notApplicableCoverage: "Ej tillämpligt", nmNegativeEarnings: "N/M — negativt resultat", observations: "observationer",
    years: "år", reportedDerived: "Rapporterade och deterministiskt härledda värden. Saknade eller olämpliga mått lämnas tomma.",
  } : {
    revenueCagr3y: "Revenue CAGR 3Y", revenueCagr10y: "Revenue CAGR 10Y",
    epsCagr3y: "EPS CAGR 3Y", epsCagr10y: "EPS CAGR 10Y",
    dividendCagr3y: "Dividend CAGR 3Y", dividendCagr5y: "Dividend CAGR 5Y",
    dividendCagr10y: "Dividend CAGR 10Y", yearsIncreased: "Years increased",
    yearsUnchanged: "Years unchanged", yearsCut: "Years cut",
    latestYield: "Latest dividend yield", latestDps: "Latest dividend / share",
    payout: "Payout", fcfPayout: "FCF payout", historicalPe: "Historical P/E",
    referencePrice: "Reference price", dividendYield: "Dividend yield", dividendPerShare: "Dividend / share",
    currentPe: "Current P/E", historicalPeMedian: "Historical median P/E", peVsHistory: "Vs historical median",
    tenYearPeMedian: "10Y median P/E", currentYield: "Current dividend yield", historicalYieldAverage: "Historical yield average",
    ttmEps: "TTM EPS", ttmDividend: "TTM dividend / share", valuationDate: "Date", insufficientHistory: "Insufficient history",
    discountQuality: "Historical Discount Quality", discountVsHistoricalMedian: "Discount vs historical median",
    evidenceCoverage: "Evidence coverage", deteriorationScore: "Deterioration score", notApplicable: "Not applicable",
    signalEvidence: "Deterministic signals", historicalSnapshot: "Historical snapshot",
    currentColumn: "Current", oneYearColumn: "1Y", threeYearColumn: "3Y", fiveYearColumn: "5Y", tenYearColumn: "10Y", maxColumn: "MAX",
    dividendGrowth: "Dividend growth", snapshotNote: "Current shows the latest level where applicable. Horizon columns show growth or historical median/average context. MAX uses the longest verified history and never relabels shorter history as 10Y.",
    priceContext: "Price context", currentPrice: "Current price", yearHigh: "52W high", yearLow: "52W low",
    threeYearRange: "3Y range", fiveYearRange: "5Y range", tenYearRange: "10Y range", maxRange: "MAX range",
    below: "below", above: "above", priceContextNote: "The 52-week range uses provider data when complete, otherwise verified one-year price history. Multi-year ranges are shown only when actual time coverage is sufficient.",
    paymentFrequency: "Payment frequency", latestPayment: "Latest payment", increaseStreak: "Increase streak", dividendSafety: "Dividend safety", coverage: "Coverage",
    monthly: "Monthly", quarterly: "Quarterly", semiannual: "Semiannual", annual: "Annual", irregular: "Irregular", none: "None", unknown: "Unknown",
    covered: "Covered", stretched: "Stretched", notCovered: "Not covered", insufficient: "Insufficient data", events: "events",
    historicalCoverage: "Historical coverage", financialsCoverage: "Financials", priceCoverage: "Price history", valuationCoverage: "Valuation history", dividendCoverage: "Dividend history",
    coverageSeparate: "Coverage is separate from model confidence", fullCoverage: "Full coverage", partialCoverage: "Insufficient history", unavailableCoverage: "Unavailable", notApplicableCoverage: "Not applicable", nmNegativeEarnings: "N/M — negative earnings", observations: "observations",
    years: "years", reportedDerived: "Reported and deterministically derived values. Missing or unsuitable metrics remain unavailable.",
  };
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-[#9aa7b8]">{label}</p>
      <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{value}</p>
    </div>
  );
}

function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-white/10">
      <table className="min-w-full border-collapse text-left text-xs">{children}</table>
    </div>
  );
}

const headClass = "whitespace-nowrap border-b border-white/10 px-3 py-2 font-semibold text-[#e1cb95]";
const cellClass = "whitespace-nowrap border-b border-white/5 px-3 py-2 text-[#c9d2df]";

function peLabel(point: HistoricalValuationPoint, notMeaningful: string, unavailable: string, locale: Locale) {
  if (isNumber(point.priceEarnings)) return formatNumber(point.priceEarnings, locale, unavailable, 1);
  if (point.priceEarningsStatus === "not_meaningful") return notMeaningful;
  return unavailable;
}

function trendLabel(classification: HistoricalTrendClassification, copy: ReturnType<typeof copyFor>) {
  if (classification === "accelerating") return copy.accelerating;
  if (classification === "decelerating") return copy.decelerating;
  if (classification === "stable") return copy.stable;
  if (classification === "volatile") return copy.volatile;
  return copy.unavailable;
}

function latestFinancial(points: HistoricalFinancialPoint[]) {
  return points.at(-1) ?? null;
}

function valuationWindowValue(
  window: HistoricalValuationWindowStats | undefined,
  selector: (value: HistoricalValuationWindowStats) => number | null,
  formatter: (value: number | null) => string,
  insufficientHistory: string,
) {
  if (!window?.sufficientHistory) return insufficientHistory;
  return formatter(selector(window));
}

function longestGrowthValue(
  values: Array<{ label: string; value: number | null | undefined }>,
  locale: Locale,
  unavailable: string,
  insufficientHistory: string,
) {
  const match = values.find((item) => isNumber(item.value));
  return match ? match.label + " " + formatPercent(match.value ?? null, locale, unavailable) : insufficientHistory;
}

function PriceContextCard({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const context = report.historical?.priceContext;
  if (!context) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const currency = report.market?.currency ?? report.reportingCurrency;
  const money = (value: number | null) => formatMoney(value, currency, locale, copy.unavailable, false);
  const relation = (value: number | null, direction: "high" | "low") => {
    if (!isNumber(value)) return copy.unavailable;
    const magnitude = formatPercent(Math.abs(value), locale, copy.unavailable);
    if (direction === "high") return value <= 0 ? magnitude + " " + extra.below : magnitude + " " + extra.above;
    return value >= 0 ? magnitude + " " + extra.above : magnitude + " " + extra.below;
  };
  const range = (window: typeof context.oneYear) =>
    window.sufficientHistory && isNumber(window.low) && isNumber(window.high)
      ? money(window.low) + " – " + money(window.high)
      : extra.insufficientHistory;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{extra.priceContext}</h2>
        {context.currentPriceDate ? <Badge>{context.currentPriceDate}</Badge> : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{extra.priceContextNote}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={extra.currentPrice} value={money(context.currentPrice)} />
        <Stat label={extra.yearHigh} value={context.yearHigh === null ? copy.unavailable : money(context.yearHigh) + " · " + relation(context.distanceToYearHigh, "high")} />
        <Stat label={extra.yearLow} value={context.yearLow === null ? copy.unavailable : money(context.yearLow) + " · " + relation(context.distanceFromYearLow, "low")} />
        <Stat label={extra.threeYearRange} value={range(context.threeYear)} />
        <Stat label={extra.fiveYearRange} value={range(context.fiveYear)} />
        <Stat label={extra.tenYearRange} value={range(context.tenYear)} />
        <Stat label={extra.maxRange} value={range(context.maximum)} />
      </div>
    </Card>
  );
}

function HistoricalCoverageCard({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const coverage = report.historical?.coverage;
  if (!coverage) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const statusLabel = (item: HistoricalCoverageItem) => item.status === "full"
    ? extra.fullCoverage
    : item.status === "partial"
      ? extra.partialCoverage
      : item.status === "not_applicable"
        ? extra.notApplicableCoverage
        : extra.unavailableCoverage;
  const yearsLabel = (item: HistoricalCoverageItem) =>
    formatNumber(item.availableYears, locale, copy.unavailable, 1) + "/" + item.requestedYears + " " + extra.years;
  const rows: Array<{ key: string; label: string; item: HistoricalCoverageItem; suffix?: string }> = [
    { key: "financials", label: extra.financialsCoverage, item: coverage.financials },
    { key: "price", label: extra.priceCoverage, item: coverage.price },
    { key: "valuation", label: extra.valuationCoverage, item: coverage.valuation },
    {
      key: "dividend",
      label: extra.dividendCoverage,
      item: coverage.dividend,
      suffix: coverage.dividend.eventCoverageYears === undefined
        ? undefined
        : " · " + formatNumber(coverage.dividend.eventCoverageYears, locale, copy.unavailable, 1) + " " + extra.years + " " + extra.events,
    },
  ];
  return (
    <Card className="border-[#b99b5f]/20 bg-[#b99b5f]/[0.025]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{extra.historicalCoverage}</h2>
        <Badge>{coverage.methodVersion}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{extra.coverageSeparate}.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(({ key, label, item, suffix }) => (
          <div key={key} className="rounded-md border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-[#9aa7b8]">{label}</p>
            <p className="number mt-1 text-lg font-semibold text-[#f4efe5]">{yearsLabel(item)}{suffix ?? ""}</p>
            <p className="mt-1 text-xs text-[#9aa7b8]">{statusLabel(item)} · {item.observationCount} {extra.observations}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HistoricalSnapshot({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const latest = latestFinancial(historical.financials);
  const valuation = historical.valuationContext;
  const currency = latest?.currency ?? report.reportingCurrency;
  const percent = (value: number | null | undefined) => formatPercent(value ?? null, locale, copy.unavailable);
  const multiple = (value: number | null | undefined) => isNumber(value) ? formatNumber(value, locale, copy.unavailable, 1) + "×" : copy.unavailable;
  const longest = (ten: number | null | undefined, five: number | null | undefined, three: number | null | undefined, one: number | null | undefined) =>
    longestGrowthValue([
      { label: "10Y", value: ten },
      { label: "5Y", value: five },
      { label: "3Y", value: three },
      { label: "1Y", value: one },
    ], locale, copy.unavailable, extra.insufficientHistory);
  const windowPe = (window: HistoricalValuationWindowStats | undefined) =>
    valuationWindowValue(window, (value) => value.priceEarningsMedian, (value) => multiple(value), extra.insufficientHistory);
  const windowYield = (window: HistoricalValuationWindowStats | undefined) =>
    valuationWindowValue(window, (value) => value.dividendYieldAverage, (value) => percent(value), extra.insufficientHistory);
  const currentPe = valuation?.currentPriceEarningsStatus === "not_meaningful"
    ? extra.nmNegativeEarnings
    : multiple(valuation?.currentPriceEarnings);

  const rows = [
    {
      key: "pe", label: "P/E",
      values: [
        currentPe,
        windowPe(valuation?.oneYear),
        windowPe(valuation?.threeYear),
        windowPe(valuation?.fiveYear),
        windowPe(valuation?.tenYear),
        windowPe(valuation?.maximum),
      ],
    },
    {
      key: "yield", label: extra.dividendYield,
      values: [
        percent(valuation?.currentDividendYield),
        windowYield(valuation?.oneYear),
        windowYield(valuation?.threeYear),
        windowYield(valuation?.fiveYear),
        windowYield(valuation?.tenYear),
        windowYield(valuation?.maximum),
      ],
    },
    {
      key: "dividend-growth", label: extra.dividendGrowth,
      values: [
        formatMoney(latest?.dividendPerShare ?? null, currency, locale, copy.unavailable, false),
        percent(latest?.dividendGrowth),
        percent(historical.dividendCagr3y),
        percent(historical.dividendCagr5y),
        isNumber(historical.dividendCagr10y) ? percent(historical.dividendCagr10y) : extra.insufficientHistory,
        longest(historical.dividendCagr10y, historical.dividendCagr5y, historical.dividendCagr3y, latest?.dividendGrowth),
      ],
    },
    {
      key: "revenue", label: copy.revenue,
      values: [
        formatMoney(latest?.revenue ?? null, currency, locale, copy.unavailable),
        percent(latest?.revenueGrowth),
        percent(historical.revenueCagr3y),
        percent(historical.revenueCagr5y),
        isNumber(historical.revenueCagr10y) ? percent(historical.revenueCagr10y) : extra.insufficientHistory,
        longest(historical.revenueCagr10y, historical.revenueCagr5y, historical.revenueCagr3y, latest?.revenueGrowth),
      ],
    },
    {
      key: "eps", label: copy.eps,
      values: [
        formatNumber(latest?.eps ?? null, locale, copy.unavailable),
        percent(latest?.epsGrowth),
        percent(historical.epsCagr3y),
        percent(historical.epsCagr5y),
        isNumber(historical.epsCagr10y) ? percent(historical.epsCagr10y) : extra.insufficientHistory,
        longest(historical.epsCagr10y, historical.epsCagr5y, historical.epsCagr3y, latest?.epsGrowth),
      ],
    },
    {
      key: "fcf", label: copy.fcf,
      values: [
        formatMoney(latest?.freeCashFlow ?? null, currency, locale, copy.unavailable),
        percent(historical.freeCashFlowGrowth1y),
        percent(historical.freeCashFlowCagr3y),
        percent(historical.freeCashFlowCagr5y),
        isNumber(historical.freeCashFlowCagr10y) ? percent(historical.freeCashFlowCagr10y) : extra.insufficientHistory,
        longest(historical.freeCashFlowCagr10y, historical.freeCashFlowCagr5y, historical.freeCashFlowCagr3y, historical.freeCashFlowGrowth1y),
      ],
    },
  ];

  return (
    <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/[0.035]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{extra.historicalSnapshot}</h2>
        <Badge>{historical.financials.length} {extra.years}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{extra.snapshotNote}</p>
      <TableShell>
        <thead><tr>
          {[copy.metric, extra.currentColumn, extra.oneYearColumn, extra.threeYearColumn, extra.fiveYearColumn, extra.tenYearColumn, extra.maxColumn].map((label) => (
            <th key={label} className={headClass}>{label}</th>
          ))}
        </tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.key}>
            <td className={cellClass + " font-semibold text-[#f4efe5]"}>{row.label}</td>
            {row.values.map((value, index) => <td key={index} className={cellClass}>{value}</td>)}
          </tr>
        ))}</tbody>
      </TableShell>
    </Card>
  );
}

function GrowthDashboard({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const rows = buildGrowthDashboardRows(historical.financials);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.growthDashboard}</h2>
      <TableShell>
        <thead><tr>
          {[copy.metric, copy.oneYear, copy.threeYearCagr, copy.fiveYearCagr, copy.tenYearCagr, copy.classification].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}>
          <td className={cellClass}>{row.label}</td>
          <td className={cellClass}>{formatPercent(row.oneYearGrowth, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(row.threeYearCagr, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(row.fiveYearCagr, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(row.tenYearCagr, locale, copy.unavailable)}</td>
          <td className={cellClass}>{trendLabel(row.classification, copy)}</td>
        </tr>)}</tbody>
      </TableShell>
    </Card>
  );
}

function MarginDashboard({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const rows = buildMarginDashboardRows(historical.financials);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.marginDashboard}</h2>
      <TableShell>
        <thead><tr>
          {[copy.metric, copy.current, copy.oneYearAgo, copy.threeYearAverage, copy.fiveYearAverage, copy.classification].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}>
          <td className={cellClass}>{row.label}</td>
          <td className={cellClass}>{formatPercent(row.current, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(row.oneYearAgo, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(row.threeYearAverage, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(row.fiveYearAverage, locale, copy.unavailable)}</td>
          <td className={cellClass}>{trendLabel(row.classification, copy)}</td>
        </tr>)}</tbody>
      </TableShell>
    </Card>
  );
}

function DividendSnapshot({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const latest = latestFinancial(historical.financials);
  const valuation = historical.valuationContext;
  const context = historical.dividendContext;
  const frequencyLabel = context?.paymentFrequency ? extra[context.paymentFrequency] : copy.unavailable;
  const safetyLabel = context?.safety === "covered" ? extra.covered
    : context?.safety === "stretched" ? extra.stretched
      : context?.safety === "not_covered" ? extra.notCovered
        : extra.insufficient;
  const latestPayment = context?.latestPaymentDate && isNumber(context.latestPaymentAmount)
    ? formatMoney(context.latestPaymentAmount, context.latestPaymentCurrency ?? latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false) + " · " + context.latestPaymentDate
    : copy.unavailable;
  const coverage = context
    ? context.annualHistoryYears + " " + extra.years + " · " + formatNumber(context.eventCoverageYears, locale, copy.unavailable, 1) + " " + extra.years + " " + extra.events
    : copy.unavailable;
  return (
    <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.dividendSnapshot}</h2>
        <Badge>{historical.financials.length} {extra.years}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={extra.latestDps} value={formatMoney(context?.trailingDividendsPerShare ?? valuation?.currentTrailingDividendsPerShare ?? null, latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false)} />
        <Stat label={extra.latestYield} value={formatPercent(context?.currentDividendYield ?? valuation?.currentDividendYield ?? null, locale, copy.unavailable)} />
        <Stat label={extra.paymentFrequency} value={frequencyLabel} />
        <Stat label={extra.latestPayment} value={latestPayment} />
        <Stat label={extra.increaseStreak} value={context?.increaseStreakYears === null || context?.increaseStreakYears === undefined ? copy.unavailable : context.increaseStreakYears + " " + extra.years} />
        <Stat label={extra.dividendSafety} value={safetyLabel} />
        <Stat label={extra.coverage} value={coverage} />
        <Stat label={extra.payout} value={formatPercent(latest?.payoutRatio ?? null, locale, copy.unavailable)} />
        <Stat label={extra.fcfPayout} value={formatPercent(latest?.freeCashFlowPayoutRatio ?? null, locale, copy.unavailable)} />
        <Stat label={extra.dividendCagr3y} value={formatPercent(historical.dividendCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.dividendCagr5y} value={formatPercent(historical.dividendCagr5y, locale, copy.unavailable)} />
        <Stat label={extra.dividendCagr10y} value={formatPercent(historical.dividendCagr10y, locale, copy.unavailable)} />
        <Stat label={extra.yearsIncreased} value={String(historical.dividendYearsIncreased)} />
        <Stat label={extra.yearsUnchanged} value={String(historical.dividendYearsUnchanged)} />
        <Stat label={extra.yearsCut} value={String(historical.dividendYearsCut)} />
      </div>
    </Card>
  );
}
function HistoricalOverview({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const valuation = historical.valuationContext;
  const referenceLabel = valuation?.referenceWindow === "5Y"
    ? `5Y ${extra.historicalPeMedian}`
    : `MAX ${extra.historicalPeMedian}${valuation?.availableSince ? ` (${valuation.availableSince.slice(0, 4)}-)` : ""}`;
  const yieldWindow = valuation?.fiveYear.sufficientHistory ? valuation.fiveYear : valuation?.maximum;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.historicalContext}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <FinancialDataExportButton ticker={report.ticker} historical={historical} label={copy.downloadCsv} />
          <Badge>{historical.financials.length} {extra.years}</Badge>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{extra.reportedDerived}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={extra.revenueCagr3y} value={formatPercent(historical.revenueCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.revenueCagr10y} value={formatPercent(historical.revenueCagr10y, locale, copy.unavailable)} />
        <Stat label={extra.epsCagr3y} value={formatPercent(historical.epsCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.epsCagr10y} value={formatPercent(historical.epsCagr10y, locale, copy.unavailable)} />
      </div>
      {valuation ? (
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[#f4efe5]">{copy.valuationHistory}</h3>
            <Badge>{valuation.methodVersion}</Badge>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label={extra.currentPe} value={valuation.currentPriceEarningsStatus === "not_meaningful" ? extra.nmNegativeEarnings : formatNumber(valuation.currentPriceEarnings, locale, copy.unavailable, 1)} />
            <Stat label={referenceLabel} value={formatNumber(valuation.referencePriceEarningsMedian, locale, copy.unavailable, 1)} />
            <Stat label={extra.peVsHistory} value={formatPercent(valuation.currentPeVsReferenceMedian, locale, copy.unavailable)} />
            <Stat label={extra.tenYearPeMedian} value={valuation.tenYear.sufficientHistory ? formatNumber(valuation.tenYear.priceEarningsMedian, locale, copy.unavailable, 1) : extra.insufficientHistory} />
            <Stat label={extra.currentYield} value={formatPercent(valuation.currentDividendYield, locale, copy.unavailable)} />
            <Stat label={valuation?.fiveYear.sufficientHistory ? `5Y ${extra.historicalYieldAverage}` : `MAX ${extra.historicalYieldAverage}`} value={formatPercent(yieldWindow?.dividendYieldAverage ?? null, locale, copy.unavailable)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#9aa7b8]">
            {valuation.maximum.observationCount} TTM observations{valuation.availableSince ? ` · ${valuation.availableSince}–${valuation.maximum.lastDate ?? ""}` : ""}. {extra.reportedDerived}
          </p>
        </div>
      ) : null}
      <div className="mt-5 border-t border-white/10 pt-4">
        <h3 className="text-sm font-semibold text-[#f4efe5]">{copy.priceHistory}</h3>
        <div className="mt-2">
          <HistoricalChartExplorer historical={historical} locale={locale} />
        </div>
      </div>
    </Card>
  );
}
function HistoricalDiscountQualityCard({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const quality = report.historical?.discountQuality;
  if (!quality) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const warnings = quality.signals.filter((signal) => signal.status === "warning" || signal.status === "severe");
  const summary = locale === "sv"
    ? quality.status === "not_discount"
      ? "Nuvarande P/E ligger inte under den valda historiska medianen, så rabattkvalitet är inte tillämplig."
      : quality.classification === "INSUFFICIENT DATA"
        ? "Det finns inte tillräckligt med jämförbar evidens för att bedöma kvaliteten på den historiska P/E-rabatten."
        : warnings.length
          ? String(warnings.length) + " försämringssignal" + (warnings.length === 1 ? "" : "er") + " sänker kvaliteten på den historiska P/E-rabatten."
          : "Ingen materiell försämringssignal hittades i den jämförbara evidensen som används av den versionerade regelmotorn."
    : quality.summary;
  return (
    <Card className="border-[#b99b5f]/20 bg-[#b99b5f]/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{extra.discountQuality}</h2>
        <Badge>{quality.methodVersion}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">
        {locale === "sv" ? "Låg P/E klassas inte automatiskt som billig. StockBox testar om fundamenta har försämrats med en versionerad regelmotor." : "A low P/E is not treated as automatically cheap. StockBox tests whether fundamentals have deteriorated using a versioned rule set."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={copy.classification} value={quality.classification ?? extra.notApplicable} />
        <Stat label={extra.discountVsHistoricalMedian} value={formatPercent(quality.discountToReferenceMedian, locale, copy.unavailable)} />
        <Stat label={extra.evidenceCoverage} value={formatPercent(quality.coverage, locale, copy.unavailable)} />
        <Stat label={extra.deteriorationScore} value={formatPercent(quality.deteriorationScore, locale, copy.unavailable)} />
      </div>
      <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{summary}</p>
      {warnings.length ? (
        <div className="mt-3 flex flex-wrap gap-2" aria-label={extra.signalEvidence}>
          {warnings.map((signal) => (
            <Badge key={signal.key}>{signal.label}: {signal.status}</Badge>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-[#7f8da0]">
        {quality.evaluatedSignalCount}/{quality.applicableSignalCount} {extra.signalEvidence.toLowerCase()} · {quality.referenceWindow ?? copy.unavailable}
      </p>
    </Card>
  );
}

function GrowthHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.growthHistory}</h2>
      <TableShell>
        <thead><tr>
          {[copy.fiscalYear, copy.revenue, copy.revenueGrowth, copy.eps, copy.epsGrowth, copy.netIncome, copy.fcf, copy.fcfMargin, copy.operatingMargin, copy.roe, copy.roic].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{historical.financials.map((point) => <tr key={point.fiscalYear}>
          <td className={cellClass}>{point.fiscalYear}</td>
          <td className={cellClass}>{formatMoney(point.revenue, point.currency ?? report.reportingCurrency, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.revenueGrowth, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatNumber(point.eps, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.epsGrowth, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatMoney(point.netIncome, point.currency ?? report.reportingCurrency, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatMoney(point.freeCashFlow, point.currency ?? report.reportingCurrency, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.freeCashFlowMargin, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.operatingMargin, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.returnOnEquity, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.returnOnInvestedCapital, locale, copy.unavailable)}</td>
        </tr>)}</tbody>
      </TableShell>
    </Card>
  );
}
function BalanceHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.balanceHistory}</h2>
      <TableShell>
        <thead><tr>
          {[copy.fiscalYear, copy.cash, copy.debt, copy.netDebt, copy.debtEquity, copy.currentRatio, copy.shares, copy.shareGrowth].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{historical.financials.map((point) => <tr key={point.fiscalYear}>
          <td className={cellClass}>{point.fiscalYear}</td>
          <td className={cellClass}>{formatMoney(point.cash, point.currency ?? report.reportingCurrency, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatMoney(point.totalDebt, point.currency ?? report.reportingCurrency, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatMoney(point.netDebt, point.currency ?? report.reportingCurrency, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatNumber(point.debtToEquity, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatNumber(point.currentRatio, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatNumber(point.sharesOutstanding, locale, copy.unavailable, 0)}</td>
          <td className={cellClass}>{formatPercent(point.shareGrowth, locale, copy.unavailable)}</td>
        </tr>)}</tbody>
      </TableShell>
    </Card>
  );
}
function ValuationHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const points = historical.valuation ?? [];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.valuationHistory}</h2>
        {historical.valuationMethodVersion ? <Badge>{historical.valuationMethodVersion}</Badge> : null}
      </div>
      {!points.length ? <p className="mt-3 text-sm text-[#9aa7b8]">{extra.insufficientHistory}</p> : (
        <TableShell>
          <thead><tr>
            {[extra.valuationDate, extra.referencePrice, extra.ttmEps, extra.historicalPe, extra.ttmDividend, extra.dividendYield].map((label) => <th key={label} className={headClass}>{label}</th>)}
          </tr></thead>
          <tbody>{points.map((point) => <tr key={point.date}>
            <td className={cellClass}>{point.date}</td>
            <td className={cellClass}>{formatMoney(point.referencePrice, report.reportingCurrency, locale, copy.unavailable, false)}</td>
            <td className={cellClass}>{formatNumber(point.ttmEps, locale, copy.unavailable)}</td>
            <td className={cellClass}>{peLabel(point, copy.notMeaningful, copy.unavailable, locale)}</td>
            <td className={cellClass}>{formatMoney(point.trailingDividendsPerShare, report.reportingCurrency, locale, copy.unavailable, false)}</td>
            <td className={cellClass}>{formatPercent(point.dividendYield, locale, copy.unavailable)}</td>
          </tr>)}</tbody>
        </TableShell>
      )}
    </Card>
  );
}
function DividendHistory({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.dividendHistory}</h2>
      <div className="mt-4">
        <LineChart
          points={historical.financials.map((point) => ({ label: String(point.fiscalYear), value: point.dividendPerShare }))}
          label={copy.dividendHistory}
          unavailable={copy.unavailable}
        />
      </div>
      <TableShell>
        <thead><tr>
          {[copy.fiscalYear, extra.dividendPerShare, extra.payout, extra.fcfPayout].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{historical.financials.map((point) => <tr key={point.fiscalYear}>
          <td className={cellClass}>{point.fiscalYear}</td>
          <td className={cellClass}>{formatMoney(point.dividendPerShare, point.currency ?? report.reportingCurrency, locale, copy.unavailable, false)}</td>
          <td className={cellClass}>{formatPercent(point.payoutRatio, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.freeCashFlowPayoutRatio, locale, copy.unavailable)}</td>
        </tr>)}</tbody>
      </TableShell>
    </Card>
  );
}
export function HistoricalResearchView({
  report,
  mode,
  locale,
}: {
  report: AnalysisReport;
  mode: UiMode;
  locale: Locale;
}) {
  const historical = report.historical;
  if (!historical || (!historical.financials.length && !historical.price.length)) return null;
  const dividendProfile = report.investmentProfile === "dividend";
  const dividendStatus = historical.dividendContext?.status;
  const showDividendSnapshot = dividendProfile || (mode === "simple" && (dividendStatus === "available" || dividendStatus === "partial"));
  return (
    <div className="space-y-5">
      {showDividendSnapshot ? <DividendSnapshot report={report} locale={locale} /> : null}
      {mode === "simple" ? <HistoricalCoverageCard report={report} locale={locale} /> : null}
      {mode === "simple" ? <PriceContextCard report={report} locale={locale} /> : null}
      {mode === "simple" ? <HistoricalSnapshot report={report} locale={locale} /> : null}
      <HistoricalOverview report={report} locale={locale} />
      <HistoricalDiscountQualityCard report={report} locale={locale} />
      {mode === "pro" ? (
        <>
          <GrowthDashboard report={report} locale={locale} />
          <MarginDashboard report={report} locale={locale} />
          <GrowthHistory report={report} locale={locale} />
          <BalanceHistory report={report} locale={locale} />
          <ValuationHistory report={report} locale={locale} />
          {dividendProfile ? <DividendHistory report={report} locale={locale} /> : null}
        </>
      ) : null}
    </div>
  );
}
