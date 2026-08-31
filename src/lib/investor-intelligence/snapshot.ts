import type { AnalysisReport, ScoreDimensionKey } from "@/lib/analysis/types";
import { buildHistoricalValuationSummary } from "./historical-valuation";
import type { CompanyMetricSnapshot } from "./types";

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positive(value: number | null | undefined): number | null {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

export function buildCompanyMetricSnapshot(
  report: AnalysisReport,
  overrides?: { fairValue?: { fairValue: number | null; bear: number | null; bull: number | null } },
): CompanyMetricSnapshot {
  const engine = report.engine;
  const engineMetrics = engine?.metrics;
  const valuation = engineMetrics?.valuation;
  const cashFlow = engineMetrics?.cashFlow;
  const growth = engineMetrics?.growth;
  const margins = engineMetrics?.margins;
  const ratios = engineMetrics?.ratios;
  const price = finite(report.market?.price);

  const historicalValuation = buildHistoricalValuationSummary({
    financials: report.historical?.financials ?? [],
    current: {
      pe: finite(valuation?.priceEarnings),
      ps: finite(valuation?.priceSales),
      fcfYield: finite(valuation?.freeCashFlowYield ?? report.metrics.fcfYield),
      dividendYield: finite(cashFlow?.dividendYield),
    },
  });
  const peMetric = historicalValuation.metrics.pe;
  const longestPeStats = peMetric.windows.tenYear
    ?? peMetric.windows.fiveYear
    ?? peMetric.windows.threeYear
    ?? peMetric.windows.max;
  const peHorizon = peMetric.windows.tenYear ? "10Y"
    : peMetric.windows.fiveYear ? "5Y"
      : peMetric.windows.threeYear ? "3Y"
        : peMetric.windows.max ? "MAX" : null;

  const engineDcfAvailable = engine?.dcf.status === "available";
  const legacyDcfAvailable = report.dcf.suitable;
  const overrideFair = positive(overrides?.fairValue?.fairValue);
  const fairValue = overrideFair
    ?? (engineDcfAvailable ? positive(engine?.dcf.mid) : null)
    ?? (legacyDcfAvailable ? positive(report.dcf.base) : null);
  const fairValueLow = positive(overrides?.fairValue?.bear)
    ?? (engineDcfAvailable ? positive(engine?.dcf.low) : null)
    ?? (legacyDcfAvailable ? positive(report.dcf.bear) : null);
  const fairValueHigh = positive(overrides?.fairValue?.bull)
    ?? (engineDcfAvailable ? positive(engine?.dcf.high) : null)
    ?? (legacyDcfAvailable ? positive(report.dcf.bull) : null);

  const dimensions = engine
    ? (Object.fromEntries(
        Object.entries(engine.scores.dimensions).map(([key, dimension]) => [key, finite(dimension.score)]),
      ) as Partial<Record<ScoreDimensionKey, number | null>>)
    : Object.fromEntries(report.score.dimensions.map((dimension) => [dimension.key, finite(dimension.score)])) as Partial<Record<ScoreDimensionKey, number | null>>;

  const latestHistorical = [...(report.historical?.financials ?? [])]
    .sort((left, right) => right.fiscalYear - left.fiscalYear)[0];

  return {
    ticker: report.ticker,
    companyName: report.companyName,
    capturedAt: report.generatedAt,
    analysisId: report.id,
    price,
    priceChange1d: finite(report.market?.performance?.["1D"]),
    score: finite(engine?.scores.stockBoxScore ?? report.score.score),
    personalizedScore: finite(engine?.scores.personalizedScore ?? report.score.personalizedScore),
    confidence: finite(engine?.scores.confidence ?? report.score.confidence),
    coverage: finite(engine?.dataCoverage ?? report.dataCoverage),
    fairValue,
    fairValueLow,
    fairValueHigh,
    fairValueUpside: fairValue !== null && price !== null && price > 0 ? fairValue / price - 1 : null,
    archetype: engine?.analysisArchetype ?? report.analysisArchetype ?? null,
    valuation: {
      pe: finite(valuation?.priceEarnings),
      forwardPe: null,
      ps: finite(valuation?.priceSales),
      evSales: finite(valuation?.evSales),
      evEbitda: finite(valuation?.evEbitda),
      fcfYield: finite(valuation?.freeCashFlowYield ?? report.metrics.fcfYield),
      dividendYield: finite(cashFlow?.dividendYield),
      historicalPePercentile: finite(longestPeStats?.currentPercentile),
      peVs5yMedian: finite(peMetric.windows.fiveYear?.differenceVsMedian),
      peVs10yMedian: finite(peMetric.windows.tenYear?.differenceVsMedian),
    },
    fundamentals: {
      revenueGrowth: finite(growth?.revenueGrowthYoY ?? report.metrics.revenueGrowth1y),
      epsGrowth: finite(growth?.epsGrowthYoY ?? report.metrics.epsGrowth1y),
      fcf: finite(cashFlow?.simpleFreeCashFlow ?? report.metrics.fcf),
      fcfGrowth: finite(growth?.freeCashFlowGrowthYoY),
      fcfMargin: finite(margins?.freeCashFlowMargin ?? report.metrics.fcfMargin),
      grossMargin: finite(margins?.grossMargin ?? report.metrics.grossMargin),
      operatingMargin: finite(margins?.operatingMargin ?? report.metrics.operatingMargin),
      netMargin: finite(margins?.netMargin ?? report.metrics.netMargin),
      roic: finite(ratios?.returnOnInvestedCapital),
      roe: finite(ratios?.returnOnEquity),
      netDebt: finite(ratios?.netDebt ?? report.metrics.netDebt),
      netDebtToEbitda: finite(ratios?.netDebtToEbitda),
    },
    dividend: {
      yield: finite(cashFlow?.dividendYield),
      payoutRatio: finite(cashFlow?.dividendPayoutRatio),
      fcfPayoutRatio: finite(cashFlow?.freeCashFlowPayoutRatio),
      growth: finite(cashFlow?.dividendGrowthYoY),
      dividendPerShare: finite(latestHistorical?.dividendPerShare),
    },
    estimates: {
      revenueGrowth: finite(report.forwardEstimates?.nextYearRevenueGrowth),
      epsGrowth: finite(report.forwardEstimates?.nextYearEpsGrowth),
      fcfGrowth: finite(report.forwardEstimates?.nextYearFreeCashFlowGrowth),
      targetPrice: null,
    },
    dimensions,
    riskFlags: (engine?.redFlags ?? []).map((flag) => ({
      code: flag.code,
      label: flag.label,
      severity: flag.severity,
    })),
    sourceMeta: {
      modelVersion: engine?.modelVersion ?? report.modelVersion ?? null,
      reportSchemaVersion: engine?.reportSchemaVersion ?? report.reportSchemaVersion ?? null,
      dataAsOf: report.dataAsOf ?? null,
      dataStatus: report.dataStatus ?? engine?.dataStatus ?? null,
      historicalPeHorizon: peHorizon,
      historicalValuationUnsupported: historicalValuation.unsupportedWithoutAdditionalHistoricalInputs,
    },
  };
}
