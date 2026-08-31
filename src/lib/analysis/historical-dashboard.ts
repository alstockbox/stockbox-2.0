import type { HistoricalFinancialPoint } from "./types";
import { calculateCagr, calculateGrowth, isFiniteNumber } from "./math";

export type HistoricalTrendClassification = "accelerating" | "decelerating" | "stable" | "volatile" | "unavailable";

export type GrowthDashboardRow = {
  key: string;
  label: string;
  oneYearGrowth: number | null;
  threeYearCagr: number | null;
  fiveYearCagr: number | null;
  tenYearCagr: number | null;
  classification: HistoricalTrendClassification;
};

export type MarginDashboardRow = {
  key: string;
  label: string;
  current: number | null;
  oneYearAgo: number | null;
  threeYearAverage: number | null;
  fiveYearAverage: number | null;
  classification: HistoricalTrendClassification;
};

function sorted(points: HistoricalFinancialPoint[]) {
  return [...points].sort((left, right) => left.fiscalYear - right.fiscalYear);
}

function finite(value: number | null | undefined): value is number {
  return isFiniteNumber(value);
}

function valueYears(
  points: HistoricalFinancialPoint[],
  selector: (point: HistoricalFinancialPoint) => number | null,
) {
  return sorted(points)
    .map((point) => ({ year: point.fiscalYear, value: selector(point) }))
    .filter((point): point is { year: number; value: number } => finite(point.value));
}

function cagrFor(
  points: HistoricalFinancialPoint[],
  years: number,
  selector: (point: HistoricalFinancialPoint) => number | null,
) {
  const values = valueYears(points, selector);
  const latest = values.at(-1);
  if (!latest) return null;
  const prior = values.find((point) => point.year === latest.year - years);
  return prior ? calculateCagr(prior.value, latest.value, years) : null;
}

function oneYearGrowthFor(
  points: HistoricalFinancialPoint[],
  selector: (point: HistoricalFinancialPoint) => number | null,
) {
  const values = valueYears(points, selector);
  const current = values.at(-1);
  const prior = values.at(-2);
  return current && prior ? calculateGrowth(current.value, prior.value) : null;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function classifySeries(values: number[]): HistoricalTrendClassification {
  if (values.length < 3) return "unavailable";
  const changes = values.slice(1).map((value, index) => value - values[index]);
  if (changes.length >= 3 && stdev(changes) > 0.08) return "volatile";
  const recent = changes.at(-1) ?? 0;
  const prior = changes.slice(0, -1).reduce((sum, value) => sum + value, 0) / Math.max(changes.length - 1, 1);
  if (Math.abs(recent - prior) < 0.01) return "stable";
  return recent > prior ? "accelerating" : "decelerating";
}

function growthClassification(
  points: HistoricalFinancialPoint[],
  selector: (point: HistoricalFinancialPoint) => number | null,
) {
  const values = valueYears(points, selector).map((point) => point.value);
  if (values.length < 4) return "unavailable";
  const rates = values.slice(1).map((value, index) => calculateGrowth(value, values[index])).filter(finite);
  if (rates.length < 3) return "unavailable";
  if (stdev(rates) > 0.08) return "volatile";
  const recent = rates.at(-1) ?? 0;
  const prior = rates.slice(0, -1).reduce((sum, value) => sum + value, 0) / Math.max(rates.length - 1, 1);
  if (Math.abs(recent - prior) < 0.01) return "stable";
  return recent > prior ? "accelerating" : "decelerating";
}

function marginAverage(
  points: HistoricalFinancialPoint[],
  years: number,
  selector: (point: HistoricalFinancialPoint) => number | null,
) {
  const values = valueYears(points, selector).slice(-years).map((point) => point.value);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function marginRow(
  points: HistoricalFinancialPoint[],
  key: string,
  label: string,
  selector: (point: HistoricalFinancialPoint) => number | null,
): MarginDashboardRow {
  const values = valueYears(points, selector);
  return {
    key,
    label,
    current: values.at(-1)?.value ?? null,
    oneYearAgo: values.at(-2)?.value ?? null,
    threeYearAverage: marginAverage(points, 3, selector),
    fiveYearAverage: marginAverage(points, 5, selector),
    classification: classifySeries(values.map((point) => point.value)),
  };
}

function growthRow(
  points: HistoricalFinancialPoint[],
  key: string,
  label: string,
  selector: (point: HistoricalFinancialPoint) => number | null,
): GrowthDashboardRow {
  return {
    key,
    label,
    oneYearGrowth: oneYearGrowthFor(points, selector),
    threeYearCagr: cagrFor(points, 3, selector),
    fiveYearCagr: cagrFor(points, 5, selector),
    tenYearCagr: cagrFor(points, 10, selector),
    classification: growthClassification(points, selector),
  };
}

export function buildGrowthDashboardRows(points: HistoricalFinancialPoint[]): GrowthDashboardRow[] {
  return [
    growthRow(points, "revenue", "Revenue", (point) => point.revenue),
    growthRow(points, "eps", "EPS", (point) => point.eps),
    growthRow(points, "netIncome", "Net income", (point) => point.netIncome),
    growthRow(points, "freeCashFlow", "Free cash flow", (point) => point.freeCashFlow),
    growthRow(points, "freeCashFlowPerShare", "FCF / share", (point) => point.freeCashFlowPerShare),
  ];
}

export function buildMarginDashboardRows(points: HistoricalFinancialPoint[]): MarginDashboardRow[] {
  return [
    marginRow(points, "grossMargin", "Gross margin", (point) => point.grossMargin),
    marginRow(points, "operatingMargin", "Operating margin", (point) => point.operatingMargin),
    marginRow(points, "netMargin", "Net margin", (point) => point.netMargin),
    marginRow(points, "freeCashFlowMargin", "FCF margin", (point) => point.freeCashFlowMargin),
  ];
}
