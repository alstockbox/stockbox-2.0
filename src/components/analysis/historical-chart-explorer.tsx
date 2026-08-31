"use client";

import { useMemo, useState } from "react";
import type { HistoricalFinancialPoint, HistoricalResearchData, MarketPricePoint } from "@/lib/analysis/types";
import { barGeometry, chartCoordinates, chartDomain } from "@/lib/analysis/chart-geometry";
import type { Locale } from "@/lib/i18n/types";

type SeriesKind = "currency" | "percent" | "number";
type MetricKey = "price" | "revenue" | "freeCashFlow" | "operatingMargin" | "eps" | "sharesOutstanding";
type PeriodKey = "1y" | "3y" | "5y" | "10y" | "max";
type ValueMode = "absolute" | "growth";
type ChartType = "line" | "bar";
type ChartPoint = { label: string; dateKey: string; value: number | null; kind: SeriesKind; currency?: string | null };

const PERIODS: Array<{ key: PeriodKey; label: string; limit: number | null }> = [
  { key: "1y", label: "1Y", limit: 13 },
  { key: "3y", label: "3Y", limit: 37 },
  { key: "5y", label: "5Y", limit: 61 },
  { key: "10y", label: "10Y", limit: 121 },
  { key: "max", label: "MAX", limit: null },
];

function localeTag(locale: Locale) {
  return locale === "sv" ? "sv-SE" : "en-US";
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function copyFor(locale: Locale) {
  return locale === "sv" ? {
    title: "Interaktiv grafvy",
    metric: "Mått",
    period: "Period",
    selected: "Vald punkt",
    absolute: "Värde",
    growth: "Förändring",
    chartType: "Graftyp",
    line: "Linje",
    bar: "Staplar",
    range: "Intervall",
    unavailable: "Saknas",
    price: "Pris",
    revenue: "Omsättning",
    freeCashFlow: "FCF",
    operatingMargin: "Rörelsemarginal",
    eps: "EPS",
    sharesOutstanding: "Aktier",
  } : {
    title: "Interactive chart view",
    metric: "Metric",
    period: "Period",
    selected: "Selected point",
    absolute: "Value",
    growth: "Change",
    chartType: "Chart type",
    line: "Line",
    bar: "Bars",
    range: "Range",
    unavailable: "Unavailable",
    price: "Price",
    revenue: "Revenue",
    freeCashFlow: "FCF",
    operatingMargin: "Operating margin",
    eps: "EPS",
    sharesOutstanding: "Shares",
  };
}

function formatValue(point: ChartPoint | null, locale: Locale, fallback: string) {
  if (!point || !isNumber(point.value)) return fallback;
  if (point.kind === "percent") {
    return new Intl.NumberFormat(localeTag(locale), { style: "percent", maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(point.value);
  }
  if (point.kind === "currency") {
    try {
      return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency: point.currency || "USD", notation: "compact", maximumFractionDigits: 1 }).format(point.value);
    } catch {
      return new Intl.NumberFormat(localeTag(locale), { maximumFractionDigits: 1 }).format(point.value);
    }
  }
  return new Intl.NumberFormat(localeTag(locale), { notation: "compact", maximumFractionDigits: 1 }).format(point.value);
}

function financialPoint(point: HistoricalFinancialPoint, metric: MetricKey): ChartPoint {
  const value = metric === "revenue"
    ? point.revenue
    : metric === "freeCashFlow"
      ? point.freeCashFlow
      : metric === "operatingMargin"
        ? point.operatingMargin
        : metric === "eps"
          ? point.eps
          : point.sharesOutstanding;
  return {
    label: String(point.fiscalYear),
    dateKey: String(point.fiscalYear),
    value,
    kind: metric === "operatingMargin" ? "percent" : metric === "eps" || metric === "sharesOutstanding" ? "number" : "currency",
    currency: point.currency,
  };
}

function pricePoint(point: MarketPricePoint): ChartPoint {
  return {
    label: point.date.slice(0, 7),
    dateKey: point.date,
    value: point.close,
    kind: "currency",
  };
}

function pointsFor(historical: HistoricalResearchData, metric: MetricKey, period: PeriodKey): ChartPoint[] {
  const raw = metric === "price"
    ? historical.price.map(pricePoint)
    : historical.financials.map((point) => financialPoint(point, metric));
  const selectedPeriod = PERIODS.find((item) => item.key === period);
  return selectedPeriod?.limit ? raw.slice(-selectedPeriod.limit) : raw;
}

function growthPoints(points: ChartPoint[]): ChartPoint[] {
  return points.map((point, index) => {
    const prior = points[index - 1];
    if (!prior || !isNumber(point.value) || !isNumber(prior.value) || prior.value <= 0) {
      return { ...point, value: null, kind: "percent" };
    }
    return { ...point, value: point.value / prior.value - 1, kind: "percent" };
  });
}

export function HistoricalChartExplorer({
  historical,
  locale,
}: {
  historical: HistoricalResearchData;
  locale: Locale;
}) {
  const copy = copyFor(locale);
  const [metric, setMetric] = useState<MetricKey>("price");
  const [period, setPeriod] = useState<PeriodKey>("5y");
  const [valueMode, setValueMode] = useState<ValueMode>("absolute");
  const [chartType, setChartType] = useState<ChartType>("line");
  const points = useMemo(() => {
    const base = pointsFor(historical, metric, period);
    return valueMode === "growth" && metric !== "operatingMargin" ? growthPoints(base) : base;
  }, [historical, metric, period, valueMode]);
  const numeric = points.filter((point): point is ChartPoint & { value: number } => isNumber(point.value));
  const domain = chartDomain(numeric, chartType === "bar");
  const coords = chartCoordinates(numeric, 720, 220, chartType === "bar");
  const zeroLine = barGeometry({ label: "0", dateKey: "0", value: 0, x: 0, y: 0 }, domain, 220, coords.length).baselineY;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = coords.find((point) => point.dateKey === activeKey) ?? coords.at(-1) ?? null;
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const metrics: Array<{ key: MetricKey; label: string }> = [
    { key: "price", label: copy.price },
    { key: "revenue", label: copy.revenue },
    { key: "freeCashFlow", label: copy.freeCashFlow },
    { key: "operatingMargin", label: copy.operatingMargin },
    { key: "eps", label: copy.eps },
    { key: "sharesOutstanding", label: copy.sharesOutstanding },
  ];

  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#f4efe5]">{copy.title}</h3>
          <p className="mt-1 text-xs text-[#9aa7b8]">{copy.selected}: {active ? `${active.label} · ${formatValue(active, locale, copy.unavailable)}` : copy.unavailable}</p>
          <p className="mt-1 text-xs text-[#7f8da0]">
            {copy.range}: {numeric.length ? `${formatValue({ ...numeric[0], value: domain.min }, locale, copy.unavailable)} - ${formatValue({ ...numeric[0], value: domain.max }, locale, copy.unavailable)}` : copy.unavailable}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <div className="flex rounded-md border border-white/10 bg-[#07111f] p-1">
            {([
              ["absolute", copy.absolute],
              ["growth", copy.growth],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setValueMode(key);
                  setActiveKey(null);
                }}
                className={valueMode === key ? "rounded px-2.5 py-1 text-xs font-semibold text-[#f4efe5] bg-[#b99b5f]/20" : "rounded px-2.5 py-1 text-xs font-semibold text-[#9aa7b8] hover:text-[#f4efe5]"}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-white/10 bg-[#07111f] p-1" aria-label={copy.chartType}>
            {([
              ["line", copy.line],
              ["bar", copy.bar],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setChartType(key)}
                className={chartType === key ? "rounded px-2.5 py-1 text-xs font-semibold text-[#f4efe5] bg-[#b99b5f]/20" : "rounded px-2.5 py-1 text-xs font-semibold text-[#9aa7b8] hover:text-[#f4efe5]"}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriod(item.key)}
                className={period === item.key ? "rounded-md border border-[#b99b5f]/50 bg-[#b99b5f]/15 px-2.5 py-1.5 text-xs font-semibold text-[#f4efe5]" : "rounded-md border border-white/10 bg-[#07111f] px-2.5 py-1.5 text-xs font-semibold text-[#c9d2df] hover:bg-white/8"}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label={copy.metric}>
        {metrics.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setMetric(item.key);
              setActiveKey(null);
            }}
            className={metric === item.key ? "rounded-md border border-[#b99b5f]/50 bg-[#b99b5f]/15 px-3 py-2 text-xs font-semibold text-[#f4efe5]" : "rounded-md border border-white/10 bg-[#07111f] px-3 py-2 text-xs font-semibold text-[#c9d2df] hover:bg-white/8"}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {coords.length >= 2 ? (
          <svg viewBox="0 0 720 220" role="img" aria-label={`${copy.title}: ${metrics.find((item) => item.key === metric)?.label ?? metric}`} className="h-56 w-full text-[#e1cb95]">
            {chartType === "bar" && domain.min < 0 && domain.max > 0 ? (
              <line x1="28" x2="692" y1={zeroLine} y2={zeroLine} className="stroke-white/20" strokeDasharray="4 4" />
            ) : null}
            {chartType === "line" ? <path d={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" /> : null}
            {chartType === "bar" ? coords.map((point) => {
              const bar = barGeometry(point, domain, 220, coords.length);
              return (
                <rect
                  key={`bar-${point.dateKey}`}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx={2}
                  className={active?.dateKey === point.dateKey ? "fill-[#f4efe5]" : "fill-[#e1cb95]"}
                  onMouseEnter={() => setActiveKey(point.dateKey)}
                />
              );
            }) : null}
            {coords.map((point) => (
              <g key={point.dateKey}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={active?.dateKey === point.dateKey ? 5 : 3}
                  className="cursor-pointer fill-[#f4efe5] stroke-[#081421]"
                  strokeWidth="2"
                  tabIndex={0}
                  role="button"
                  aria-label={`${point.label}: ${formatValue(point, locale, copy.unavailable)}`}
                  onMouseEnter={() => setActiveKey(point.dateKey)}
                  onFocus={() => setActiveKey(point.dateKey)}
                >
                  <title>{`${point.label}: ${formatValue(point, locale, copy.unavailable)}`}</title>
                </circle>
              </g>
            ))}
          </svg>
        ) : (
          <p className="text-sm text-[#9aa7b8]">{copy.unavailable}</p>
        )}
      </div>
      <div className="flex justify-between text-xs text-[#9aa7b8]">
        <span>{coords[0]?.label}</span>
        <span>{coords.at(-1)?.label}</span>
      </div>
    </div>
  );
}
