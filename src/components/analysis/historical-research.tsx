import type { ReactNode } from "react";
import type {
  AnalysisReport,
  HistoricalFinancialPoint,
  MarketPricePoint,
  UiMode,
} from "@/lib/analysis/types";
import type { Locale } from "@/lib/i18n/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const isNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

function copyFor(locale: Locale) {
  if (locale === "sv") return {
    historicalContext: "Historisk utveckling", priceHistory: "Prishistorik",
    growthHistory: "Tillväxt- & lönsamhetshistorik", balanceHistory: "Balansräkningshistorik",
    valuationHistory: "Historisk värdering", dividendSnapshot: "Utdelningsöversikt",
    dividendHistory: "Utdelningshistorik", unavailable: "Saknas", notMeaningful: "Ej meningsfullt",
    fiscalYear: "År", revenue: "Omsättning", revenueGrowth: "Omsättningstillväxt",
    eps: "EPS", epsGrowth: "EPS-tillväxt", netIncome: "Nettoresultat", fcf: "FCF",
    fcfMargin: "FCF-marginal", operatingMargin: "Rörelsemarginal", roe: "ROE", roic: "ROIC",
    cash: "Kassa", debt: "Skuld", netDebt: "Nettoskuld", debtEquity: "Skuld/eget kapital",
    currentRatio: "Current ratio", shares: "Aktier", shareGrowth: "Aktieförändring",
  };
  return {
    historicalContext: "Historical context", priceHistory: "Price history",
    growthHistory: "Growth & profitability history", balanceHistory: "Balance sheet history",
    valuationHistory: "Historical valuation", dividendSnapshot: "Dividend snapshot",
    dividendHistory: "Dividend history", unavailable: "Unavailable", notMeaningful: "Not meaningful",
    fiscalYear: "FY", revenue: "Revenue", revenueGrowth: "Revenue growth",
    eps: "EPS", epsGrowth: "EPS growth", netIncome: "Net income", fcf: "FCF",
    fcfMargin: "FCF margin", operatingMargin: "Operating margin", roe: "ROE", roic: "ROIC",
    cash: "Cash", debt: "Debt", netDebt: "Net debt", debtEquity: "Debt / equity",
    currentRatio: "Current ratio", shares: "Shares", shareGrowth: "Share growth",
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

function peLabel(point: HistoricalFinancialPoint, notMeaningful: string, unavailable: string, locale: Locale) {
  if (isNumber(point.priceEarnings)) return formatNumber(point.priceEarnings, locale, unavailable, 1);
  if (isNumber(point.eps) && point.eps <= 0) return notMeaningful;
  return unavailable;
}

function latestFinancial(points: HistoricalFinancialPoint[]) {
  return points.at(-1) ?? null;
}
function DividendSnapshot({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  const latest = latestFinancial(historical.financials);
  return (
    <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.dividendSnapshot}</h2>
        <Badge>{historical.financials.length} {extra.years}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={extra.latestDps} value={formatMoney(latest?.dividendPerShare ?? null, latest?.currency ?? report.reportingCurrency, locale, copy.unavailable, false)} />
        <Stat label={extra.latestYield} value={formatPercent(latest?.dividendYield ?? null, locale, copy.unavailable)} />
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
function priceChartPoints(points: MarketPricePoint[]): ChartPoint[] {
  return points.map((point) => ({ label: point.date.slice(0, 7), value: point.close }));
}

function HistoricalOverview({ report, locale }: { report: AnalysisReport; locale: Locale }) {
  const historical = report.historical;
  if (!historical) return null;
  const copy = copyFor(locale);
  const extra = extraCopyFor(locale);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.historicalContext}</h2>
        <Badge>{historical.financials.length} {extra.years}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#9aa7b8]">{extra.reportedDerived}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={extra.revenueCagr3y} value={formatPercent(historical.revenueCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.revenueCagr10y} value={formatPercent(historical.revenueCagr10y, locale, copy.unavailable)} />
        <Stat label={extra.epsCagr3y} value={formatPercent(historical.epsCagr3y, locale, copy.unavailable)} />
        <Stat label={extra.epsCagr10y} value={formatPercent(historical.epsCagr10y, locale, copy.unavailable)} />
      </div>
      <div className="mt-5 border-t border-white/10 pt-4">
        <h3 className="text-sm font-semibold text-[#f4efe5]">{copy.priceHistory}</h3>
        <div className="mt-2">
          <LineChart points={priceChartPoints(historical.price)} label={copy.priceHistory} unavailable={copy.unavailable} />
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
  return (
    <Card>
      <h2 className="text-lg font-semibold text-[#f4efe5]">{copy.valuationHistory}</h2>
      <TableShell>
        <thead><tr>
          {[copy.fiscalYear, extra.referencePrice, extra.historicalPe, extra.dividendYield, extra.dividendPerShare, extra.payout, extra.fcfPayout].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{historical.financials.map((point) => <tr key={point.fiscalYear}>
          <td className={cellClass}>{point.fiscalYear}</td>
          <td className={cellClass}>{formatMoney(point.referencePrice, point.currency ?? report.reportingCurrency, locale, copy.unavailable, false)}</td>
          <td className={cellClass}>{peLabel(point, copy.notMeaningful, copy.unavailable, locale)}</td>
          <td className={cellClass}>{formatPercent(point.dividendYield, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatMoney(point.dividendPerShare, point.currency ?? report.reportingCurrency, locale, copy.unavailable, false)}</td>
          <td className={cellClass}>{formatPercent(point.payoutRatio, locale, copy.unavailable)}</td>
          <td className={cellClass}>{formatPercent(point.freeCashFlowPayoutRatio, locale, copy.unavailable)}</td>
        </tr>)}</tbody>
      </TableShell>
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
          {[copy.fiscalYear, extra.dividendPerShare, extra.dividendYield, extra.payout, extra.fcfPayout].map((label) => <th key={label} className={headClass}>{label}</th>)}
        </tr></thead>
        <tbody>{historical.financials.map((point) => <tr key={point.fiscalYear}>
          <td className={cellClass}>{point.fiscalYear}</td>
          <td className={cellClass}>{formatMoney(point.dividendPerShare, point.currency ?? report.reportingCurrency, locale, copy.unavailable, false)}</td>
          <td className={cellClass}>{formatPercent(point.dividendYield, locale, copy.unavailable)}</td>
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
          <GrowthHistory report={report} locale={locale} />
          <BalanceHistory report={report} locale={locale} />
          <ValuationHistory report={report} locale={locale} />
          {dividendProfile ? <DividendHistory report={report} locale={locale} /> : null}
        </>
      ) : null}
    </div>
  );
}
