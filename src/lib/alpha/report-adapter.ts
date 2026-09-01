import type { AnalysisReport, HistoricalFinancialPoint } from "../analysis/types";
import type { AlphaHistoryPoint, AlphaSignalInput } from "./types";

const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function fraction(value: number | null | undefined, fallback = 0): number {
  if (!finite(value)) return fallback;
  return clamp01(value > 1 ? value / 100 : value);
}

function periodLabel(point: HistoricalFinancialPoint): string {
  return point.periodEndDate ?? String(point.fiscalYear);
}

function historyFromReport(report: AnalysisReport): AlphaHistoryPoint[] {
  return (report.historical?.financials ?? [])
    .slice()
    .sort((left, right) => periodLabel(left).localeCompare(periodLabel(right)))
    .slice(-6)
    .map((point) => ({
      period: periodLabel(point),
      revenueGrowth: point.revenueGrowth,
      operatingMargin: point.operatingMargin,
      epsGrowth: point.epsGrowth,
      fcfMargin: point.freeCashFlowMargin,
      shareGrowth: point.shareGrowth,
    }));
}

function sourceBackedCatalyst(report: AnalysisReport): AlphaSignalInput["catalyst"] {
  const research = report.research;
  if (!research?.events.length) return null;
  const opportunity = research.opportunity.score;
  if (!finite(opportunity)) return null;
  const evidenceCount = new Set(research.events.map((event) => event.accession)).size;
  return {
    strength: fraction(opportunity, 0.5),
    confidence: fraction(research.confidence, 0.5),
    sourceCount: evidenceCount,
  };
}

export function buildAlphaSignalInputFromReport(report: AnalysisReport): AlphaSignalInput {
  const engine = report.engine;
  const latestHistorical = report.historical?.financials?.at(-1);
  const confidence = fraction(report.score.confidence, 0.5);
  const coverage = fraction(report.dataCoverage, 0.5);
  const sourceConflictPenalty = engine?.sourceConflicts?.some((conflict) => conflict.severity === "high") ? 0.15 : 0;
  const stalePenalty = report.dataStatus === "stale" ? 0.25 : 0;
  const dataQuality = clamp01(confidence * 0.58 + coverage * 0.42 - sourceConflictPenalty - stalePenalty);

  return {
    ticker: report.ticker,
    companyName: report.companyName,
    sector: engine?.scores?.sector ?? null,
    archetype: report.analysisArchetype ?? engine?.analysisArchetype ?? null,
    analysisDate: report.generatedAt,
    market: {
      price: report.market?.price ?? null,
      marketCap: report.market?.marketCap ?? engine?.metrics?.valuation?.marketCap ?? null,
      volume: report.market?.volume ?? null,
      yearHigh: report.market?.yearHigh ?? null,
      yearLow: report.market?.yearLow ?? null,
      performance1m: report.market?.performance?.["1M"] ?? null,
      performance3m: report.market?.performance?.["3M"] ?? report.metrics.priceMomentum3m ?? null,
      performance6m: report.market?.performance?.["6M"] ?? null,
      performance1y: report.market?.performance?.["1Y"] ?? report.metrics.priceMomentum1y ?? null,
    },
    valuation: {
      pe: engine?.metrics?.valuation?.priceEarnings ?? report.historical?.valuationContext?.currentPriceEarnings ?? null,
      evEbitda: engine?.metrics?.valuation?.evEbitda ?? null,
      fcfYield: engine?.metrics?.valuation?.freeCashFlowYield ?? report.metrics.fcfYield ?? null,
      earningsYield: engine?.metrics?.valuation?.earningsYield ?? report.metrics.earningsYield ?? null,
    },
    balanceSheet: {
      debtToEquity: engine?.metrics?.ratios?.debtToEquity ?? report.metrics.debtToEquity ?? latestHistorical?.debtToEquity ?? null,
      netDebtToEbitda: engine?.metrics?.ratios?.netDebtToEbitda ?? null,
      interestCoverage: engine?.metrics?.ratios?.interestCoverage ?? report.metrics.interestCoverage ?? latestHistorical?.interestCoverage ?? null,
      currentRatio: engine?.metrics?.ratios?.currentRatio ?? latestHistorical?.currentRatio ?? null,
    },
    history: historyFromReport(report),
    forward: {
      revenueGrowth: report.forwardEstimates?.nextYearRevenueGrowth ?? null,
      epsGrowth: report.forwardEstimates?.nextYearEpsGrowth ?? null,
      fcfGrowth: report.forwardEstimates?.nextYearFreeCashFlowGrowth ?? null,
    },
    catalyst: sourceBackedCatalyst(report),
    // A single point-in-time analyst estimate is not an estimate revision. Leave this unavailable
    // until StockBox has comparable point-in-time estimate snapshots.
    estimateRevision: null,
    // Sentiment is intentionally unavailable unless a dedicated, source-backed sentiment series exists.
    sentimentShift: null,
    dataQuality,
  };
}
