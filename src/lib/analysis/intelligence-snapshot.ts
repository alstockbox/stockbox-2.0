import { applyAnalysisLens } from "./analysis-lens";
import { computeInflectionAssessment, type InflectionAssessment, type InflectionInput } from "./inflection";
import { computeMispricingAssessment, type MispricingAssessment, type MispricingInput } from "./mispricing";
import { computeOpportunityAssessment, type OpportunityAssessment } from "./opportunity";
import type { AnalysisReport, HistoricalFinancialPoint, InvestmentProfile } from "./types";

export type IntelligenceSnapshot = {
  canonicalCoreScore: number | null;
  lensCoreScore: number | null;
  mispricing: MispricingAssessment;
  inflection: InflectionAssessment;
  opportunity: OpportunityAssessment;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function dimensionScore(report: AnalysisReport, key: string): number | null {
  const value = report.score.dimensions.find((dimension) => dimension.key === key)?.score;
  return finite(value) ? value : null;
}

function orderedFinancials(report: AnalysisReport): HistoricalFinancialPoint[] {
  return [...(report.historical?.financials ?? [])].sort((left, right) => {
    const byDate = (left.periodEndDate ?? "").localeCompare(right.periodEndDate ?? "");
    return byDate || left.fiscalYear - right.fiscalYear;
  });
}

function latestFinancialPair(report: AnalysisReport) {
  const financials = orderedFinancials(report);
  return {
    previous: financials.length >= 2 ? financials.at(-2) ?? null : null,
    current: financials.at(-1) ?? null,
  };
}

function averageScenarioConfidence(report: AnalysisReport): number {
  const values = (report.engine?.dcf.scenarios ?? [])
    .map((scenario) => scenario.confidence)
    .filter((value): value is number => finite(value));
  if (!values.length) return 50;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sourceConflictSeverity(report: AnalysisReport): "none" | "medium" | "high" {
  const conflicts = report.engine?.sourceConflicts ?? [];
  if (conflicts.some((conflict) => conflict.severity === "high" && !conflict.resolved)) return "high";
  if (conflicts.some((conflict) => conflict.severity === "medium" && !conflict.resolved)) return "medium";
  return "none";
}

function snapshotDataAsOf(report: AnalysisReport): string | null {
  const latest = orderedFinancials(report).at(-1);
  return report.dataAsOf
    ?? report.market?.date
    ?? latest?.periodEndDate
    ?? null;
}

export function mispricingInputFromReport(report: AnalysisReport): MispricingInput {
  const { previous, current } = latestFinancialPair(report);
  const valuation = report.historical?.valuationContext;
  const referenceStats = valuation
    ? valuation.referenceWindow === "5Y" ? valuation.fiveYear : valuation.maximum
    : null;
  const currentPrice = report.market?.price
    ?? report.engine?.dcf.currentPrice
    ?? report.historical?.price.at(-1)?.close
    ?? null;

  return {
    currentPrice,
    dcf: {
      suitable: report.dcf.suitable,
      bear: report.dcf.bear,
      base: report.dcf.base,
      bull: report.dcf.bull,
      confidence: averageScenarioConfidence(report),
    },
    historicalPe: valuation ? {
      current: valuation.currentPriceEarnings,
      median: valuation.referencePriceEarningsMedian,
      sufficientHistory: Boolean(
        finite(valuation.currentPriceEarnings)
        && finite(valuation.referencePriceEarningsMedian)
        && (referenceStats?.observationCount ?? 0) >= 12
      ),
      observationCount: referenceStats?.observationCount ?? 0,
    } : null,
    // Peer benchmarks currently expose metric-by-metric comparisons rather than one
    // canonical valuation score. Do not fabricate a synthetic peer score here.
    peerValuationScore: null,
    valuationDimensionScore: dimensionScore(report, "valuation"),
    trends: {
      revenueGrowthCurrent: current?.revenueGrowth ?? report.metrics.revenueGrowth1y,
      revenueGrowthPrior: previous?.revenueGrowth ?? null,
      epsGrowthCurrent: current?.epsGrowth ?? report.metrics.epsGrowth1y,
      epsGrowthPrior: previous?.epsGrowth ?? null,
      fcfMarginCurrent: current?.freeCashFlowMargin ?? report.metrics.fcfMargin,
      fcfMarginPrior: previous?.freeCashFlowMargin ?? null,
      operatingMarginCurrent: current?.operatingMargin ?? report.metrics.operatingMargin,
      operatingMarginPrior: previous?.operatingMargin ?? null,
      cashConversion: report.metrics.cashConversion,
      debtToEquity: current?.debtToEquity ?? report.metrics.debtToEquity,
      interestCoverage: current?.interestCoverage ?? report.metrics.interestCoverage,
      shareGrowth: current?.shareGrowth ?? null,
    },
    // Current persisted report schema exposes forward growth estimates but not
    // revision breadth. Missing revisions stay missing until a licensed estimate
    // provider supplies them; they are never converted into a negative signal.
    revisionNetLastMonth: null,
    redFlags: report.redFlags.map((flag) => ({ severity: flag.severity, title: flag.title })),
    sourceConflictSeverity: sourceConflictSeverity(report),
    dataStatus: report.dataStatus ?? "current",
    dataAsOf: snapshotDataAsOf(report),
  };
}

export function inflectionInputFromReport(report: AnalysisReport): InflectionInput {
  const { previous, current } = latestFinancialPair(report);
  const estimates = report.forwardEstimates;
  const hasForwardEstimates = Boolean(
    finite(estimates?.nextYearRevenueGrowth)
    || finite(estimates?.nextYearEpsGrowth)
  );
  const researchPositiveCount = report.research?.positives?.length ?? 0;
  const researchNegativeCount = report.research?.negatives?.length ?? 0;
  const hasResearchCatalysts = researchPositiveCount + researchNegativeCount > 0;

  return {
    fundamentals: current || previous ? {
      revenueGrowthCurrent: current?.revenueGrowth ?? report.metrics.revenueGrowth1y,
      revenueGrowthPrior: previous?.revenueGrowth ?? null,
      epsGrowthCurrent: current?.epsGrowth ?? report.metrics.epsGrowth1y,
      epsGrowthPrior: previous?.epsGrowth ?? null,
      fcfMarginCurrent: current?.freeCashFlowMargin ?? report.metrics.fcfMargin,
      fcfMarginPrior: previous?.freeCashFlowMargin ?? null,
      operatingMarginCurrent: current?.operatingMargin ?? report.metrics.operatingMargin,
      operatingMarginPrior: previous?.operatingMargin ?? null,
      roicCurrent: current?.returnOnInvestedCapital ?? null,
      roicPrior: previous?.returnOnInvestedCapital ?? null,
    } : null,
    expectations: hasForwardEstimates ? {
      revisionNetLastWeek: null,
      revisionNetLastMonth: null,
      nextYearRevenueGrowth: estimates?.nextYearRevenueGrowth ?? null,
      nextYearEpsGrowth: estimates?.nextYearEpsGrowth ?? null,
    } : null,
    market: report.market ? {
      oneMonth: report.market.performance["1M"] ?? null,
      threeMonth: report.market.performance["3M"] ?? report.metrics.priceMomentum3m,
      sixMonth: report.market.performance["6M"] ?? null,
      oneYear: report.market.performance["1Y"] ?? report.metrics.priceMomentum1y,
      price: report.market.price,
      yearHigh: report.market.yearHigh,
      yearLow: report.market.yearLow,
    } : (finite(report.metrics.priceMomentum3m) || finite(report.metrics.priceMomentum1y)) ? {
      oneMonth: null,
      threeMonth: report.metrics.priceMomentum3m,
      sixMonth: null,
      oneYear: report.metrics.priceMomentum1y,
      price: null,
      yearHigh: null,
      yearLow: null,
    } : null,
    funding: {
      financialHealthScore: dimensionScore(report, "financialHealth"),
      shareGrowth: current?.shareGrowth ?? null,
      interestCoverage: current?.interestCoverage ?? report.metrics.interestCoverage,
      criticalRisk: report.redFlags.some((flag) => flag.severity === "critical"),
    },
    research: hasResearchCatalysts ? {
      positiveCatalysts: researchPositiveCount,
      negativeCatalysts: researchNegativeCount,
    } : null,
    dataAsOf: snapshotDataAsOf(report),
  };
}

export function buildIntelligenceSnapshot(
  report: AnalysisReport,
  profile: InvestmentProfile = report.investmentProfile,
): IntelligenceSnapshot {
  const mispricing = computeMispricingAssessment(mispricingInputFromReport(report));
  const inflection = computeInflectionAssessment(inflectionInputFromReport(report));
  const lensReport = profile === report.investmentProfile ? report : applyAnalysisLens(report, profile);
  const canonicalCoreScore = finite(report.score.score) ? report.score.score : null;
  const lensCoreScore = finite(lensReport.score.personalizedScore)
    ? lensReport.score.personalizedScore
    : canonicalCoreScore;
  const opportunity = computeOpportunityAssessment({
    coreScore: lensCoreScore,
    mispricingScore: mispricing.score,
    inflectionScore: inflection.score,
    profile,
  });

  return {
    canonicalCoreScore,
    lensCoreScore,
    mispricing,
    inflection,
    opportunity,
  };
}
