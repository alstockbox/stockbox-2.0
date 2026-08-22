import {
  MODEL_VERSION,
  SCORE_COVERAGE_POLICY,
  STATIC_BENCHMARK_VERSION,
  benchmarksForSector,
  longTermWeights,
  profileWeights,
  shortTermWeights,
  weightsForSector,
} from "./config";
import { resolveArchetype } from "./archetypes";
import {
  clamp,
  isFiniteNumber,
  scoreHigherIsBetter,
  scoreLowerIsBetter,
  scoreTargetRange,
} from "./math";
import type {
  AnalysisArchetype,
  ConfidenceBreakdown,
  FinancialAnalysisInput,
  FinancialMetrics,
  Metrics,
  ScoreContributor,
  ScoreDimension,
  ScoreDimensionKey,
  ScoreResult,
  StockBoxScore,
} from "./types";

const dimensionLabels: Record<ScoreDimensionKey, string> = {
  growth: "Growth",
  profitability: "Profitability",
  financialHealth: "Financial Health",
  valuation: "Valuation",
  cashFlow: "Cash Flow",
  earningsQuality: "Earnings Quality",
  quality: "Business Quality",
  momentum: "Momentum",
  risk: "Risk Resilience",
};

type ContributorInput = {
  label: string;
  value: number | null;
  score: number | null;
  weight: number;
  source?: string;
  period?: string;
  unsuitable?: boolean;
};

function contributor(input: ContributorInput): ScoreContributor {
  const availability = input.unsuitable ? "unsuitable" : isFiniteNumber(input.value) && isFiniteNumber(input.score) ? "available" : "missing";
  const score = availability === "available" ? input.score : null;
  return {
    label: input.label,
    value: input.value,
    score,
    weight: input.weight,
    availability,
    source: input.source ?? "canonical financial metrics",
    period: input.period,
    impact: !isFiniteNumber(score) ? "neutral" : score >= 60 ? "positive" : score <= 40 ? "negative" : "neutral",
  };
}

function dimension(key: ScoreDimensionKey, contributors: ScoreContributor[], rationale: string): ScoreDimension {
  const plannedWeight = contributors.reduce((sum, item) => sum + item.weight, 0);
  const available = contributors.filter((item) => item.availability === "available" && isFiniteNumber(item.score));
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
  const coverage = plannedWeight > 0 ? availableWeight / plannedWeight : 0;
  const rawScore = availableWeight > 0
    ? available.reduce((sum, item) => sum + (item.score as number) * item.weight, 0) / availableWeight
    : null;
  const adjustedScore = rawScore === null || coverage < SCORE_COVERAGE_POLICY.dimensionMinimum
    ? null
    : coverage < SCORE_COVERAGE_POLICY.dimensionFull
      ? 50 + (rawScore - 50) * coverage
      : rawScore;
  return {
    key,
    label: dimensionLabels[key],
    score: adjustedScore,
    rawScore,
    adjustedScore,
    coverage,
    plannedWeight,
    availableWeight,
    weight: 0,
    rationale,
    contributors,
    missingData: contributors
      .filter((item) => item.availability !== "available")
      .map((item) => ({
        field: item.label,
        reason: item.availability === "unsuitable" ? "Metric is unsuitable for this company archetype." : "Required source data is unavailable.",
        impact: "score" as const,
        severity: "medium" as const,
      })),
  };
}

function standardDimensions(input: FinancialAnalysisInput, metrics: FinancialMetrics): Record<ScoreDimensionKey, ScoreDimension> {
  const b = benchmarksForSector(input.company.sector);
  const m = metrics;
  const latestPeriod = m.latestPeriod?.periodEndDate;
  const c = (label: string, value: number | null, score: number | null, weight: number) =>
    contributor({ label, value, score, weight, period: latestPeriod });
  return {
    growth: dimension("growth", [
      c("Revenue growth YoY", m.growth.revenueGrowthYoY, scoreHigherIsBetter(m.growth.revenueGrowthYoY, b.revenueGrowthWeak, b.revenueGrowthStrong), 0.3),
      c("Revenue CAGR 3Y", m.growth.revenueCagr3y, scoreHigherIsBetter(m.growth.revenueCagr3y, 0, b.revenueGrowthStrong), 0.3),
      c("EPS CAGR 3Y", m.growth.epsCagr3y, scoreHigherIsBetter(m.growth.epsCagr3y, -0.03, 0.18), 0.2),
      c("FCF/share CAGR 3Y", m.growth.freeCashFlowPerShareCagr3y, scoreHigherIsBetter(m.growth.freeCashFlowPerShareCagr3y, -0.03, 0.15), 0.2),
    ], "Growth requires both breadth and durability; one isolated metric cannot carry the dimension."),
    profitability: dimension("profitability", [
      c("Gross margin", m.margins.grossMargin, scoreHigherIsBetter(m.margins.grossMargin, b.grossMarginWeak, b.grossMarginStrong), 0.2),
      c("Operating margin", m.margins.operatingMargin, scoreHigherIsBetter(m.margins.operatingMargin, b.operatingMarginWeak, b.operatingMarginStrong), 0.3),
      c("Net margin", m.margins.netMargin, scoreHigherIsBetter(m.margins.netMargin, b.netMarginWeak, b.netMarginStrong), 0.2),
      c("ROIC", m.ratios.returnOnInvestedCapital, scoreHigherIsBetter(m.ratios.returnOnInvestedCapital, b.roicWeak, b.roicStrong), 0.3),
    ], "Margins and average-capital returns measure operating economics."),
    financialHealth: dimension("financialHealth", [
      c("Net debt / EBITDA", m.ratios.netDebtToEbitda, scoreLowerIsBetter(m.ratios.netDebtToEbitda, b.netDebtToEbitdaWeak, b.netDebtToEbitdaStrong), 0.35),
      c("Interest coverage", m.ratios.interestCoverage, scoreHigherIsBetter(m.ratios.interestCoverage, b.interestCoverageWeak, b.interestCoverageStrong), 0.3),
      c("Cash / debt", m.ratios.cashToDebt, scoreHigherIsBetter(m.ratios.cashToDebt, 0.1, 1), 0.2),
      c("Current ratio", m.ratios.currentRatio, scoreTargetRange(m.ratios.currentRatio, 0.5, 1.2, 3, 6), 0.15),
    ], "Only reported balance-sheet values are used; missing debt or cash is never treated as zero."),
    valuation: dimension("valuation", [
      c("P/E", m.valuation.priceEarnings, scoreLowerIsBetter(m.valuation.priceEarnings, b.peExpensive, b.peAttractive), 0.25),
      c("EV / EBITDA", m.valuation.evEbitda, scoreLowerIsBetter(m.valuation.evEbitda, b.evEbitdaExpensive, b.evEbitdaAttractive), 0.25),
      c("EV / Sales", m.valuation.evSales, scoreLowerIsBetter(m.valuation.evSales, b.evSalesExpensive, b.evSalesAttractive), 0.15),
      c("FCF yield", m.valuation.freeCashFlowYield, scoreHigherIsBetter(m.valuation.freeCashFlowYield, b.fcfYieldWeak, b.fcfYieldStrong), 0.35),
    ], `Valuation uses ${STATIC_BENCHMARK_VERSION}; live peers are not implied.`),
    cashFlow: dimension("cashFlow", [
      c("Simple FCF margin", m.margins.freeCashFlowMargin, scoreHigherIsBetter(m.margins.freeCashFlowMargin, -0.02, 0.18), 0.3),
      c("CFO margin", m.margins.operatingCashFlowMargin, scoreHigherIsBetter(m.margins.operatingCashFlowMargin, 0, 0.2), 0.25),
      c("FCF growth", m.growth.freeCashFlowGrowthYoY, scoreHigherIsBetter(m.growth.freeCashFlowGrowthYoY, -0.15, 0.2), 0.2),
      c("FCF / net income", m.cashFlow.freeCashFlowToNetIncome, scoreTargetRange(m.cashFlow.freeCashFlowToNetIncome, 0, 0.8, 1.4, 2.5), 0.25),
    ], "Cash generation, growth and accounting conversion are scored separately."),
    earningsQuality: dimension("earningsQuality", [
      c("CFO / net income", m.cashFlow.cfoToNetIncome, scoreTargetRange(m.cashFlow.cfoToNetIncome, 0, 0.85, 1.5, 3), 0.35),
      c("Accrual ratio", m.cashFlow.accrualRatio, scoreLowerIsBetter(m.cashFlow.accrualRatio, 0.15, -0.05), 0.25),
      c("Operating margin stability", m.cashFlow.operatingMarginStability, scoreHigherIsBetter(m.cashFlow.operatingMarginStability, 0.3, 0.9), 0.2),
      c("FCF stability", m.cashFlow.freeCashFlowStability, scoreHigherIsBetter(m.cashFlow.freeCashFlowStability, 0.2, 0.85), 0.2),
    ], "Cash support, accruals and multi-period stability determine accounting quality."),
    quality: dimension("quality", [
      c("ROIC", m.ratios.returnOnInvestedCapital, scoreHigherIsBetter(m.ratios.returnOnInvestedCapital, b.roicWeak, b.roicStrong), 0.35),
      c("ROA", m.ratios.returnOnAssets, scoreHigherIsBetter(m.ratios.returnOnAssets, b.roaWeak, b.roaStrong), 0.2),
      c("Gross margin stability", m.cashFlow.grossMarginStability, scoreHigherIsBetter(m.cashFlow.grossMarginStability, 0.3, 0.9), 0.2),
      c("Share dilution", m.trends.sharesDilutionYoY, scoreLowerIsBetter(m.trends.sharesDilutionYoY, 0.08, -0.02), 0.25),
    ], "Capital efficiency, durability and per-share discipline form the quality composite."),
    momentum: dimension("momentum", [
      c("Price performance 3M", input.market?.pricePerformance?.threeMonth ?? null, scoreHigherIsBetter(input.market?.pricePerformance?.threeMonth ?? null, -0.2, 0.25), 0.4),
      c("Price performance 1Y", input.market?.pricePerformance?.oneYear ?? null, scoreHigherIsBetter(input.market?.pricePerformance?.oneYear ?? null, -0.35, 0.45), 0.6),
    ], "Price momentum is a limited context signal and never changes the underlying facts."),
    risk: dimension("risk", [
      c("Beta", input.market?.beta ?? null, scoreLowerIsBetter(input.market?.beta ?? null, b.betaHighRisk, b.betaLowRisk), 0.35),
      c("Interest coverage", m.ratios.interestCoverage, scoreHigherIsBetter(m.ratios.interestCoverage, 1.5, 8), 0.35),
      c("Equity / assets", m.ratios.equityToAssets, scoreHigherIsBetter(m.ratios.equityToAssets, 0.1, 0.55), 0.3),
    ], "Market sensitivity and balance-sheet resilience provide a bounded risk context."),
  };
}

function archetypeDimensions(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics,
  archetype: AnalysisArchetype,
): Record<ScoreDimensionKey, ScoreDimension> {
  const dimensions = standardDimensions(input, metrics);
  const latest = metrics.latestPeriod;
  const period = latest?.periodEndDate;
  const c = (label: string, value: number | null, score: number | null, weight: number, unsuitable = false) =>
    contributor({ label, value, score, weight, period, unsuitable });

  if (archetype === "bank" || archetype === "insurer") {
    dimensions.profitability = dimension("profitability", [
      c("ROE", metrics.ratios.returnOnEquity, scoreHigherIsBetter(metrics.ratios.returnOnEquity, 0.05, 0.18), 0.45),
      c("ROA", metrics.ratios.returnOnAssets, scoreHigherIsBetter(metrics.ratios.returnOnAssets, 0.003, 0.018), 0.3),
      c("Net margin", metrics.margins.netMargin, scoreHigherIsBetter(metrics.margins.netMargin, 0.05, 0.25), 0.25),
    ], "Equity and asset returns replace industrial capital metrics for financial institutions.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("Equity / assets", metrics.ratios.equityToAssets, scoreHigherIsBetter(metrics.ratios.equityToAssets, 0.04, 0.12), 0.6),
      c("Current ratio", null, null, 0.4, true),
    ], "Corporate leverage ratios are unsuitable; specialized regulatory capital data is required for full coverage.");
    dimensions.cashFlow = dimension("cashFlow", [c("Corporate FCF", null, null, 1, true)], "Corporate free cash flow is not a valid primary measure for this archetype.");
    dimensions.valuation = dimension("valuation", [
      c("P / Book", metrics.valuation.priceBook, scoreLowerIsBetter(metrics.valuation.priceBook, 3, 0.8), 0.55),
      c("P / E", metrics.valuation.priceEarnings, scoreLowerIsBetter(metrics.valuation.priceEarnings, 24, 9), 0.45),
    ], "Equity-oriented multiples are used; residual-income inputs remain unavailable from the current provider.");
  }

  if (archetype === "reit") {
    const ffoYield = isFiniteNumber(latest?.fundsFromOperations) && isFiniteNumber(metrics.valuation.marketCap)
      ? latest.fundsFromOperations / metrics.valuation.marketCap
      : null;
    dimensions.profitability = dimension("profitability", [c("FFO margin", isFiniteNumber(latest?.fundsFromOperations) && isFiniteNumber(latest?.revenue) ? latest.fundsFromOperations / latest.revenue : null, null, 1)], "REIT profitability requires FFO/AFFO rather than GAAP EPS.");
    dimensions.valuation = dimension("valuation", [c("FFO yield", ffoYield, scoreHigherIsBetter(ffoYield, 0.025, 0.08), 1)], "P/FFO is used only when provider-reported FFO exists; P/E does not dominate.");
    dimensions.earningsQuality = dimension("earningsQuality", [c("AFFO availability", latest?.adjustedFundsFromOperations ?? null, null, 1)], "AFFO coverage is required for a full REIT quality assessment.");
  }

  if (archetype === "software_growth") {
    dimensions.growth = dimension("growth", [
      ...dimensions.growth.contributors ?? [],
      c("Growth + FCF margin", isFiniteNumber(metrics.growth.revenueGrowthYoY) && isFiniteNumber(metrics.margins.freeCashFlowMargin) ? metrics.growth.revenueGrowthYoY + metrics.margins.freeCashFlowMargin : null, scoreHigherIsBetter(isFiniteNumber(metrics.growth.revenueGrowthYoY) && isFiniteNumber(metrics.margins.freeCashFlowMargin) ? metrics.growth.revenueGrowthYoY + metrics.margins.freeCashFlowMargin : null, 0, 0.4), 0.25),
    ], "Growth is balanced against cash generation rather than rewarded in isolation.");
    dimensions.quality = dimension("quality", [
      ...dimensions.quality.contributors ?? [],
      c("SBC / revenue", metrics.cashFlow.stockBasedCompensationToRevenue, scoreLowerIsBetter(metrics.cashFlow.stockBasedCompensationToRevenue, 0.25, 0.03), 0.25),
    ], "Dilution and stock-based compensation are explicit quality costs.");
  }

  if (archetype === "cyclical") {
    dimensions.profitability = dimension("profitability", [
      c("Operating margin", metrics.margins.operatingMargin, scoreHigherIsBetter(metrics.margins.operatingMargin, 0, 0.18), 0.3),
      c("Operating margin stability", metrics.cashFlow.operatingMarginStability, scoreHigherIsBetter(metrics.cashFlow.operatingMarginStability, 0.2, 0.8), 0.4),
      c("ROIC", metrics.ratios.returnOnInvestedCapital, scoreHigherIsBetter(metrics.ratios.returnOnInvestedCapital, 0.03, 0.15), 0.3),
    ], "Through-cycle stability prevents one peak margin year from dominating.");
    dimensions.growth = dimension("growth", [
      c("Revenue CAGR 5Y", metrics.growth.revenueCagr5y, scoreHigherIsBetter(metrics.growth.revenueCagr5y, -0.03, 0.08), 0.6),
      c("FCF stability", metrics.cashFlow.freeCashFlowStability, scoreHigherIsBetter(metrics.cashFlow.freeCashFlowStability, 0.2, 0.8), 0.4),
    ], "Longer-cycle observations replace peak-year growth emphasis.");
  }

  if (archetype === "pre_revenue_biotech") {
    const burn = isFiniteNumber(metrics.cashFlow.simpleFreeCashFlow) && metrics.cashFlow.simpleFreeCashFlow < 0
      ? Math.abs(metrics.cashFlow.simpleFreeCashFlow)
      : null;
    const runway = isFiniteNumber(latest?.cashAndEquivalents) && isFiniteNumber(burn) && burn > 0
      ? latest.cashAndEquivalents / burn
      : null;
    dimensions.growth = dimension("growth", [c("Revenue growth", null, null, 1, true)], "Pre-revenue companies are not penalized with meaningless earnings growth metrics.");
    dimensions.profitability = dimension("profitability", [c("R&D investment", latest?.researchAndDevelopment ?? null, null, 1)], "Pipeline economics require specialized clinical data not exposed by the current provider.");
    dimensions.financialHealth = dimension("financialHealth", [
      c("Cash runway (years)", runway, scoreHigherIsBetter(runway, 0.5, 3), 0.7),
      c("Share dilution", metrics.trends.sharesDilutionYoY, scoreLowerIsBetter(metrics.trends.sharesDilutionYoY, 0.25, 0), 0.3),
    ], "Cash runway and dilution replace corporate leverage metrics.");
    dimensions.valuation = dimension("valuation", [c("Pipeline valuation", null, null, 1, true)], "Risk-adjusted pipeline valuation requires real asset-level probabilities and is unavailable.");
  }

  if (archetype === "holding_company") {
    dimensions.profitability = dimension("profitability", [c("Operating margins", null, null, 1, true)], "Operating-company margins are unsuitable for holding-company economics.");
    dimensions.valuation = dimension("valuation", [c("NAV / SOTP", null, null, 1)], "NAV and look-through holdings data are required for valuation.");
  }

  if (input.company.investmentProfile === "dividend") {
    dimensions.cashFlow = dimension("cashFlow", [
      c("Dividend yield", metrics.cashFlow.dividendYield, scoreTargetRange(metrics.cashFlow.dividendYield, 0, 0.02, 0.06, 0.12), 0.2),
      c("FCF payout ratio", metrics.cashFlow.freeCashFlowPayoutRatio, scoreTargetRange(metrics.cashFlow.freeCashFlowPayoutRatio, 0, 0.2, 0.7, 1.2), 0.35),
      c("Dividend growth YoY", metrics.cashFlow.dividendGrowthYoY, scoreHigherIsBetter(metrics.cashFlow.dividendGrowthYoY, -0.1, 0.1), 0.2),
      c("Dividend CAGR 3Y", metrics.cashFlow.dividendCagr3y, scoreHigherIsBetter(metrics.cashFlow.dividendCagr3y, -0.03, 0.1), 0.25),
    ], "Yield is rewarded only alongside free-cash-flow coverage and dividend growth.");
  }

  return dimensions;
}

function aggregate(dimensions: Record<ScoreDimensionKey, ScoreDimension>, weights: Record<ScoreDimensionKey, number>) {
  const entries = Object.entries(weights) as Array<[ScoreDimensionKey, number]>;
  const coverage = entries.reduce((sum, [key, weight]) => sum + (dimensions[key].coverage ?? 0) * weight, 0);
  const available = entries.filter(([key]) => isFiniteNumber(dimensions[key].score));
  const availableWeight = available.reduce((sum, [, weight]) => sum + weight, 0);
  const rawScore = availableWeight > 0
    ? available.reduce((sum, [key, weight]) => sum + (dimensions[key].score as number) * weight, 0) / availableWeight
    : null;
  const score = rawScore === null || coverage < SCORE_COVERAGE_POLICY.overallMinimum
    ? null
    : 50 + (rawScore - 50) * coverage;
  return { score: isFiniteNumber(score) ? clamp(score, 0, 100) : null, coverage };
}

function freshnessScore(input: FinancialAnalysisInput, metrics: FinancialMetrics): number {
  const end = metrics.latestPeriod?.periodEndDate;
  if (!end) return 35;
  const age = (Date.parse(input.analysisDate ?? new Date().toISOString()) - Date.parse(end)) / 86_400_000;
  if (!Number.isFinite(age)) return 35;
  if (age <= 120) return 100;
  if (age <= 240) return 80;
  if (age <= 400) return 60;
  return 30;
}

function sourceQuality(input: FinancialAnalysisInput): number {
  const diagnostics = input.providerDiagnostics ?? [];
  if (!diagnostics.length) return 60;
  const scores = diagnostics.map((item) => item.status === "available" ? 100 : item.status === "partial" ? 65 : 20);
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function computeScores(
  input: FinancialAnalysisInput,
  metrics: FinancialMetrics,
  context: { reconciliation?: number } = {},
): ScoreResult {
  const sector = input.company.sector ?? "other";
  const investmentProfile = input.company.investmentProfile ?? "balanced";
  const analysisArchetype = resolveArchetype(input.company);
  const sectorWeights = weightsForSector(sector);
  const personalizedWeights = profileWeights[investmentProfile];
  const dimensions = archetypeDimensions(input, metrics, analysisArchetype);
  const general = aggregate(dimensions, sectorWeights);
  const personalized = aggregate(dimensions, personalizedWeights);
  const shortTerm = aggregate(dimensions, shortTermWeights);
  const longTerm = aggregate(dimensions, longTermWeights);
  for (const key of Object.keys(dimensions) as ScoreDimensionKey[]) dimensions[key].weight = sectorWeights[key];

  const estimateAvailability = input.estimates && Object.values(input.estimates).some(isFiniteNumber) ? 90 : 45;
  const valuationInputs = isFiniteNumber(metrics.valuation.marketCap) && isFiniteNumber(metrics.valuation.enterpriseValue) ? 100 : isFiniteNumber(metrics.valuation.marketCap) ? 60 : 20;
  const confidenceBreakdown: ConfidenceBreakdown = {
    dataCoverage: Math.round(general.coverage * 100),
    dataFreshness: Math.round(freshnessScore(input, metrics)),
    sourceQuality: Math.round(sourceQuality(input)),
    reconciliation: Math.round(context.reconciliation ?? 70),
    estimateAvailability,
    valuationInputs,
  };
  const confidence = Math.round(clamp(
    confidenceBreakdown.dataCoverage * 0.35 + confidenceBreakdown.dataFreshness * 0.2 +
      confidenceBreakdown.sourceQuality * 0.15 + confidenceBreakdown.reconciliation * 0.15 +
      confidenceBreakdown.estimateAvailability * 0.05 + confidenceBreakdown.valuationInputs * 0.1,
    5,
    98,
  ));
  const missingData = [...metrics.missingData, ...Object.values(dimensions).flatMap((item) => item.missingData ?? [])];
  return {
    stockBoxScore: general.score === null ? null : Math.round(general.score * 10) / 10,
    personalizedScore: personalized.score === null ? null : Math.round(personalized.score * 10) / 10,
    investmentProfile,
    sector,
    analysisArchetype,
    confidence,
    confidenceBreakdown,
    dataCoverage: general.coverage,
    dimensions,
    shortTermScore: shortTerm.score === null ? null : Math.round(shortTerm.score),
    longTermScore: longTerm.score === null ? null : Math.round(longTerm.score),
    methodology: { modelVersion: MODEL_VERSION, sectorWeights, personalizedWeights },
    missingData,
  };
}

/** @deprecated Production uses computeScores through analyzeFinancials. */
export function scoreAnalysis(metrics: Metrics): StockBoxScore {
  const available = Object.values(metrics).filter(isFiniteNumber).length;
  const coverage = available / Object.keys(metrics).length;
  return {
    score: null,
    personalizedScore: null,
    confidence: Math.round(coverage * 100),
    dimensions: [],
    missingData: Object.entries(metrics).filter(([, value]) => !isFiniteNumber(value)).map(([key]) => key),
  };
}
