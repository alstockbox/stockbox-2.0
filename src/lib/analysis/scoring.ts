import {
  MODEL_VERSION,
  benchmarksForSector,
  longTermWeights,
  profileWeights,
  shortTermWeights,
  weightsForSector,
} from "./config";
import {
  clamp,
  isFiniteNumber,
  scoreHigherIsBetter,
  scoreLowerIsBetter,
  scoreTargetRange,
  weightedAverage,
} from "./math";
import { normalizeHigherBetter, normalizeLowerBetter, weightedAverage as simpleWeightedAverage } from "./calculations";
import type {
  FinancialAnalysisInput,
  FinancialMetrics,
  InvestmentProfile,
  Metrics,
  MissingDataItem,
  ScoreContributor,
  ScoreDimension,
  ScoreDimensionKey,
  ScoreResult,
  StockBoxScore,
} from "./types";

const dimensionLabels: Record<ScoreDimensionKey, string> = {
  growth: "Growth",
  profitability: "Profitability",
  financialHealth: "Financial health",
  valuation: "Valuation",
  cashFlow: "Cash flow",
  earningsQuality: "Earnings quality",
  quality: "Quality",
  momentum: "Momentum",
  risk: "Risk",
};

function contributor(label: string, value: number | null, score: number | null, weight = 1): ScoreContributor {
  return {
    label,
    value,
    score,
    weight,
    impact: score === null ? "neutral" : score >= 65 ? "positive" : score <= 35 ? "negative" : "neutral",
  };
}

function dimension(key: ScoreDimensionKey, contributors: ScoreContributor[]): ScoreDimension {
  const result = weightedAverage(contributors.map((item) => ({ value: item.score, weight: item.weight })));
  const missingData: MissingDataItem[] = contributors
    .filter((item) => item.score === null)
    .map((item) => ({
      field: item.label,
      reason: `${item.label} is unavailable for this score dimension.`,
      impact: "score" as const,
      severity: "medium" as const,
    }));

  return {
    key,
    label: dimensionLabels[key],
    score: result.score,
    weight: 0,
    contributors,
    missingData,
  };
}

function dimensionsFor(input: FinancialAnalysisInput, metrics: FinancialMetrics): Record<ScoreDimensionKey, ScoreDimension> {
  const benchmarks = benchmarksForSector(input.company.sector);
  const beta = input.market?.beta ?? null;
  const performance = input.market?.pricePerformance;

  return {
    growth: dimension("growth", [
      contributor("Revenue growth", metrics.growth.revenueGrowthYoY, scoreHigherIsBetter(metrics.growth.revenueGrowthYoY, benchmarks.revenueGrowthWeak, benchmarks.revenueGrowthStrong), 2),
      contributor("Revenue CAGR", metrics.growth.revenueCagr3y, scoreHigherIsBetter(metrics.growth.revenueCagr3y, benchmarks.revenueGrowthWeak, benchmarks.revenueGrowthStrong), 2),
      contributor("EPS growth", metrics.growth.epsGrowthYoY, scoreHigherIsBetter(metrics.growth.epsGrowthYoY, -0.05, 0.2), 1),
      contributor("Forward revenue growth", input.estimates?.nextYearRevenueGrowth ?? null, scoreHigherIsBetter(input.estimates?.nextYearRevenueGrowth ?? null, 0, benchmarks.revenueGrowthStrong), 1),
    ]),
    profitability: dimension("profitability", [
      contributor("Gross margin", metrics.margins.grossMargin, scoreHigherIsBetter(metrics.margins.grossMargin, benchmarks.grossMarginWeak, benchmarks.grossMarginStrong), 1),
      contributor("Operating margin", metrics.margins.operatingMargin, scoreHigherIsBetter(metrics.margins.operatingMargin, benchmarks.operatingMarginWeak, benchmarks.operatingMarginStrong), 2),
      contributor("Net margin", metrics.margins.netMargin, scoreHigherIsBetter(metrics.margins.netMargin, benchmarks.netMarginWeak, benchmarks.netMarginStrong), 1),
      contributor("ROIC", metrics.ratios.returnOnInvestedCapital, scoreHigherIsBetter(metrics.ratios.returnOnInvestedCapital, benchmarks.roicWeak, benchmarks.roicStrong), 2),
    ]),
    financialHealth: dimension("financialHealth", [
      contributor("Current ratio", metrics.ratios.currentRatio, scoreHigherIsBetter(metrics.ratios.currentRatio, benchmarks.currentRatioWeak, benchmarks.currentRatioStrong), 1),
      contributor("Net debt / EBITDA", metrics.ratios.netDebtToEbitda, scoreLowerIsBetter(metrics.ratios.netDebtToEbitda, benchmarks.netDebtToEbitdaWeak, benchmarks.netDebtToEbitdaStrong), 2),
      contributor("Interest coverage", metrics.ratios.interestCoverage, scoreHigherIsBetter(metrics.ratios.interestCoverage, benchmarks.interestCoverageWeak, benchmarks.interestCoverageStrong), 2),
      contributor("Equity / assets", metrics.ratios.equityToAssets, scoreHigherIsBetter(metrics.ratios.equityToAssets, 0.15, 0.55), 1),
    ]),
    valuation: dimension("valuation", [
      contributor("Price / earnings", metrics.valuation.priceEarnings, scoreLowerIsBetter(metrics.valuation.priceEarnings, benchmarks.peExpensive, benchmarks.peAttractive), 2),
      contributor("EV / EBITDA", metrics.valuation.evEbitda, scoreLowerIsBetter(metrics.valuation.evEbitda, benchmarks.evEbitdaExpensive, benchmarks.evEbitdaAttractive), 2),
      contributor("EV / sales", metrics.valuation.evSales, scoreLowerIsBetter(metrics.valuation.evSales, benchmarks.evSalesExpensive, benchmarks.evSalesAttractive), 1),
      contributor("FCF yield", metrics.valuation.freeCashFlowYield, scoreHigherIsBetter(metrics.valuation.freeCashFlowYield, benchmarks.fcfYieldWeak, benchmarks.fcfYieldStrong), 2),
    ]),
    cashFlow: dimension("cashFlow", [
      contributor("FCF margin", metrics.margins.freeCashFlowMargin, scoreHigherIsBetter(metrics.margins.freeCashFlowMargin, 0, 0.18), 2),
      contributor("Cash conversion", metrics.ratios.cashConversion, scoreTargetRange(metrics.ratios.cashConversion, 0.3, 0.85, 1.6, 2.5), 2),
      contributor("FCF growth", metrics.growth.freeCashFlowGrowthYoY, scoreHigherIsBetter(metrics.growth.freeCashFlowGrowthYoY, -0.1, 0.2), 1),
    ]),
    earningsQuality: dimension("earningsQuality", [
      contributor("Cash conversion", metrics.ratios.cashConversion, scoreTargetRange(metrics.ratios.cashConversion, 0.3, 0.85, 1.6, 2.5), 2),
      contributor("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.08, 0), 1),
      contributor("Operating margin trend", metrics.trends.operatingMarginChangeYoY, scoreHigherIsBetter(metrics.trends.operatingMarginChangeYoY, -0.05, 0.03), 1),
    ]),
    quality: dimension("quality", [
      contributor("ROIC", metrics.ratios.returnOnInvestedCapital, scoreHigherIsBetter(metrics.ratios.returnOnInvestedCapital, benchmarks.roicWeak, benchmarks.roicStrong), 2),
      contributor("Return on assets", metrics.ratios.returnOnAssets, scoreHigherIsBetter(metrics.ratios.returnOnAssets, benchmarks.roaWeak, benchmarks.roaStrong), 1),
      contributor("Gross margin", metrics.margins.grossMargin, scoreHigherIsBetter(metrics.margins.grossMargin, benchmarks.grossMarginWeak, benchmarks.grossMarginStrong), 1),
      contributor("Revenue durability", metrics.growth.revenueCagr3y, scoreHigherIsBetter(metrics.growth.revenueCagr3y, 0, benchmarks.revenueGrowthStrong), 1),
    ]),
    momentum: dimension("momentum", [
      contributor("One-month performance", performance?.oneMonth ?? null, scoreHigherIsBetter(performance?.oneMonth ?? null, -0.1, 0.1), 1),
      contributor("Six-month performance", performance?.sixMonth ?? null, scoreHigherIsBetter(performance?.sixMonth ?? null, -0.2, 0.25), 2),
      contributor("One-year performance", performance?.oneYear ?? null, scoreHigherIsBetter(performance?.oneYear ?? null, -0.3, 0.35), 2),
    ]),
    risk: dimension("risk", [
      contributor("Beta", beta, scoreLowerIsBetter(beta, benchmarks.betaHighRisk, benchmarks.betaLowRisk), 1),
      contributor("Net debt / EBITDA", metrics.ratios.netDebtToEbitda, scoreLowerIsBetter(metrics.ratios.netDebtToEbitda, benchmarks.netDebtToEbitdaWeak, benchmarks.netDebtToEbitdaStrong), 2),
      contributor("Margin stability", metrics.trends.operatingMarginChangeYoY, scoreHigherIsBetter(metrics.trends.operatingMarginChangeYoY, -0.06, 0), 1),
    ]),
  };
}

function aggregate(dimensions: Record<ScoreDimensionKey, ScoreDimension>, weights: Record<ScoreDimensionKey, number>) {
  return weightedAverage(
    Object.entries(weights).map(([key, weight]) => ({
      value: dimensions[key as ScoreDimensionKey].score,
      weight,
    })),
  );
}

export function computeScores(input: FinancialAnalysisInput, metrics: FinancialMetrics): ScoreResult {
  const sector = input.company.sector ?? "other";
  const investmentProfile = input.company.investmentProfile ?? "balanced";
  const sectorWeights = weightsForSector(sector);
  const personalizedWeights = profileWeights[investmentProfile];
  const dimensions = dimensionsFor(input, metrics);
  const general = aggregate(dimensions, sectorWeights);
  const personalized = aggregate(dimensions, personalizedWeights);
  const shortTerm = aggregate(dimensions, shortTermWeights);
  const longTerm = aggregate(dimensions, longTermWeights);

  for (const key of Object.keys(dimensions) as ScoreDimensionKey[]) {
    dimensions[key].weight = sectorWeights[key];
  }

  const missingData = [...metrics.missingData, ...Object.values(dimensions).flatMap((item) => item.missingData ?? [])];
  const confidence = Math.round(clamp(general.coverage * 100 - missingData.filter((item) => item.severity === "high").length * 4, 10, 96));

  return {
    stockBoxScore: general.score === null ? null : Math.round(general.score * 10) / 10,
    personalizedScore: personalized.score === null ? null : Math.round(personalized.score * 10) / 10,
    investmentProfile,
    sector,
    confidence,
    dimensions,
    shortTermScore: shortTerm.score === null ? null : Math.round(shortTerm.score),
    longTermScore: longTerm.score === null ? null : Math.round(longTerm.score),
    methodology: { modelVersion: MODEL_VERSION, sectorWeights, personalizedWeights },
    missingData,
  };
}

const simpleWeights: Record<ScoreDimensionKey, number> = {
  growth: 0.14,
  profitability: 0.16,
  financialHealth: 0.15,
  valuation: 0.15,
  cashFlow: 0.12,
  earningsQuality: 0.1,
  quality: 0.12,
  momentum: 0.03,
  risk: 0.03,
};

function simpleDimensions(metrics: Metrics): ScoreDimension[] {
  const make = (key: ScoreDimensionKey, values: Array<{ score: number | null; weight: number }>, rationale: string): ScoreDimension => ({
    key,
    label: dimensionLabels[key],
    score: simpleWeightedAverage(values),
    weight: simpleWeights[key],
    rationale,
  });

  return [
    make("growth", [{ score: normalizeHigherBetter(metrics.revenueGrowth1y, -0.05, 0.2), weight: 1 }, { score: normalizeHigherBetter(metrics.revenueCagr3y, 0, 0.15), weight: 2 }, { score: normalizeHigherBetter(metrics.epsGrowth1y, -0.1, 0.2), weight: 1 }], "Revenue and earnings growth, with more weight on multi-year durability."),
    make("profitability", [{ score: normalizeHigherBetter(metrics.grossMargin, 0.2, 0.65), weight: 1 }, { score: normalizeHigherBetter(metrics.operatingMargin, 0.03, 0.25), weight: 2 }, { score: normalizeHigherBetter(metrics.netMargin, 0.02, 0.18), weight: 1 }], "Margins show how efficiently revenue becomes profit."),
    make("financialHealth", [{ score: normalizeLowerBetter(metrics.debtToEquity, 0.3, 2.5), weight: 2 }, { score: normalizeHigherBetter(metrics.interestCoverage, 2, 10), weight: 2 }, { score: normalizeLowerBetter(metrics.debtToAssets, 0.15, 0.65), weight: 1 }], "Leverage and debt-service capacity drive financial resilience."),
    make("valuation", [{ score: normalizeHigherBetter(metrics.earningsYield, 0.015, 0.08), weight: 1 }, { score: normalizeHigherBetter(metrics.fcfYield, 0.01, 0.07), weight: 2 }], "Earnings and free-cash-flow yields are used where market values are available."),
    make("cashFlow", [{ score: normalizeHigherBetter(metrics.fcfMargin, 0, 0.18), weight: 2 }, { score: normalizeHigherBetter(metrics.cashConversion, 0.4, 1.2), weight: 1 }], "Cash generation and conversion support business durability."),
    make("earningsQuality", [{ score: normalizeHigherBetter(metrics.cashConversion, 0.35, 1.1), weight: 1 }], "Cash support for reported earnings is the available quality signal."),
    make("quality", [{ score: normalizeHigherBetter(metrics.operatingMargin, 0.03, 0.25), weight: 1 }, { score: normalizeHigherBetter(metrics.revenueCagr3y, 0, 0.12), weight: 1 }, { score: normalizeHigherBetter(metrics.fcfMargin, 0, 0.15), weight: 1 }], "Durable growth, margins, and free cash flow form the quality composite."),
    make("momentum", [{ score: normalizeHigherBetter(metrics.priceMomentum3m, -0.15, 0.2), weight: 1 }, { score: normalizeHigherBetter(metrics.priceMomentum1y, -0.3, 0.4), weight: 2 }], "Observed price momentum provides limited short-term context."),
    make("risk", [{ score: normalizeLowerBetter(metrics.debtToEquity, 0.25, 3), weight: 1 }, { score: normalizeHigherBetter(metrics.interestCoverage, 1.5, 8), weight: 1 }], "Balance-sheet stress signals are scored inversely as resilience."),
  ];
}

export function scoreAnalysis(metrics: Metrics, investmentProfile: InvestmentProfile): StockBoxScore {
  const dimensions = simpleDimensions(metrics);
  const overrides = profileWeights[investmentProfile];
  const general = simpleWeightedAverage(dimensions.map((item) => ({ score: item.score, weight: item.weight })));
  const personalized = simpleWeightedAverage(dimensions.map((item) => ({ score: item.score, weight: overrides[item.key] })));
  const available = dimensions.filter((item) => isFiniteNumber(item.score)).length;
  const missingData = dimensions.filter((item) => item.score === null).map((item) => item.label);

  return {
    score: Math.round(general ?? 50),
    personalizedScore: Math.round(personalized ?? general ?? 50),
    confidence: Math.round(clamp((available / dimensions.length) * 100, 15, 95)),
    dimensions,
    missingData,
  };
}
