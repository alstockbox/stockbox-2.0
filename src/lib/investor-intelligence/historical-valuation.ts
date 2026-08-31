import type { HistoricalFinancialPoint } from "@/lib/analysis/types";

export type HistoricalValuationSample = { year: number; value: number };

export type HistoricalValuationStatistics = {
  current: number;
  observations: number;
  median: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
  currentPercentile: number;
  differenceVsMedian: number | null;
};

export type HistoricalValuationMetricSummary = {
  key: "pe" | "ps" | "pFcf" | "fcfYield" | "dividendYield";
  label: string;
  current: number | null;
  samples: HistoricalValuationSample[];
  availableYears: number;
  windows: {
    threeYear: HistoricalValuationStatistics | null;
    fiveYear: HistoricalValuationStatistics | null;
    tenYear: HistoricalValuationStatistics | null;
    max: HistoricalValuationStatistics | null;
  };
};

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 1) return sortedValues[0];
  const position = (sortedValues.length - 1) * q;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  if (lowerIndex === upperIndex) return lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

export function calculateValuationStatistics(
  samples: HistoricalValuationSample[],
  current: number | null,
): HistoricalValuationStatistics | null {
  if (!finitePositive(current)) return null;
  const values = samples.map((sample) => sample.value).filter(finitePositive).sort((a, b) => a - b);
  if (!values.length) return null;

  const median = quantile(values, 0.5);
  const atOrBelow = values.filter((value) => value <= current).length;
  return {
    current,
    observations: values.length,
    median,
    min: values[0],
    max: values.at(-1) ?? values[0],
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    currentPercentile: atOrBelow / values.length,
    differenceVsMedian: median === 0 ? null : (current - median) / Math.abs(median),
  };
}

function windowStatistics(samples: HistoricalValuationSample[], current: number | null, years: number) {
  if (!samples.length) return null;
  const latestYear = Math.max(...samples.map((sample) => sample.year));
  const window = samples.filter((sample) => sample.year >= latestYear - years + 1);
  const uniqueYears = new Set(window.map((sample) => sample.year));
  if (uniqueYears.size < years) return null;
  return calculateValuationStatistics(window, current);
}

function uniqueSortedSamples(samples: HistoricalValuationSample[]) {
  const byYear = new Map<number, number>();
  for (const sample of samples) {
    if (Number.isFinite(sample.year) && finitePositive(sample.value)) byYear.set(sample.year, sample.value);
  }
  return [...byYear.entries()].map(([year, value]) => ({ year, value })).sort((a, b) => a.year - b.year);
}

function buildMetric(
  key: HistoricalValuationMetricSummary["key"],
  label: string,
  rawSamples: HistoricalValuationSample[],
  current: number | null,
): HistoricalValuationMetricSummary {
  const samples = uniqueSortedSamples(rawSamples);
  return {
    key,
    label,
    current: finitePositive(current) ? current : null,
    samples,
    availableYears: new Set(samples.map((sample) => sample.year)).size,
    windows: {
      threeYear: windowStatistics(samples, current, 3),
      fiveYear: windowStatistics(samples, current, 5),
      tenYear: windowStatistics(samples, current, 10),
      max: calculateValuationStatistics(samples, current),
    },
  };
}

function sample(
  point: HistoricalFinancialPoint,
  value: number | null | undefined,
  allowZero = false,
): HistoricalValuationSample | null {
  const valid = allowZero ? finiteNonNegative(value) : finitePositive(value);
  return valid ? { year: point.fiscalYear, value } : null;
}

export function buildHistoricalValuationSummary(input: {
  financials: HistoricalFinancialPoint[];
  current: {
    pe: number | null;
    ps: number | null;
    fcfYield: number | null;
    dividendYield: number | null;
  };
}) {
  const peSamples: HistoricalValuationSample[] = [];
  const psSamples: HistoricalValuationSample[] = [];
  const pFcfSamples: HistoricalValuationSample[] = [];
  const fcfYieldSamples: HistoricalValuationSample[] = [];
  const dividendYieldSamples: HistoricalValuationSample[] = [];

  for (const point of input.financials) {
    const pe = sample(point, point.priceEarnings);
    if (pe) peSamples.push(pe);

    if (finitePositive(point.referencePrice) && finitePositive(point.sharesOutstanding) && finitePositive(point.revenue)) {
      const priceSales = (point.referencePrice * point.sharesOutstanding) / point.revenue;
      const ps = sample(point, priceSales);
      if (ps) psSamples.push(ps);
    }

    if (finitePositive(point.referencePrice) && finitePositive(point.freeCashFlowPerShare)) {
      const priceFcf = point.referencePrice / point.freeCashFlowPerShare;
      const pFcf = sample(point, priceFcf);
      if (pFcf) pFcfSamples.push(pFcf);
      const yieldSample = sample(point, point.freeCashFlowPerShare / point.referencePrice);
      if (yieldSample) fcfYieldSamples.push(yieldSample);
    }

    const dividendYield = sample(point, point.dividendYield, true);
    if (dividendYield) dividendYieldSamples.push(dividendYield);
  }

  const currentPFcf = finitePositive(input.current.fcfYield) ? 1 / input.current.fcfYield : null;

  return {
    generatedFrom: "reported_or_derived_historical_fundamentals" as const,
    metrics: {
      pe: buildMetric("pe", "P/E", peSamples, input.current.pe),
      ps: buildMetric("ps", "P/S", psSamples, input.current.ps),
      pFcf: buildMetric("pFcf", "P/FCF", pFcfSamples, currentPFcf),
      fcfYield: buildMetric("fcfYield", "FCF yield", fcfYieldSamples, input.current.fcfYield),
      dividendYield: buildMetric("dividendYield", "Dividend yield", dividendYieldSamples, input.current.dividendYield),
    },
    unsupportedWithoutAdditionalHistoricalInputs: ["forwardPe", "evSales", "evEbitda", "evFcf", "priceBook"] as const,
  };
}
