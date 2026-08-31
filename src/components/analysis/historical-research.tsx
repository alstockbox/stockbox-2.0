import type { ReactNode } from "react";
import type {
  AnalysisReport,
  HistoricalFinancialPoint,
  HistoricalValuationPoint,
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
  return (
    <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.dividendSnapshot}</h2>
        <Badge>{historical.financials.length} {extra.years}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={extra.latestDps} value={formatMoney(valuation?.currentTrailingDividendsPerShare ?? null, latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false)} />
        <Stat label={extra.latestYield} value={formatPercent(valuation?.currentDividendYield ?? null, locale, copy.unavailable)} />
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
            <Stat label={extra.currentPe} value={formatNumber(valuation.currentPriceEarnings, locale, copy.unavailable, 1)} />
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
  return (
    <div className="space-y-5">
      {dividendProfile ? <DividendSnapshot report={report} locale={locale} /> : null}
      <HistoricalOverview report={report} locale={locale} />
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
