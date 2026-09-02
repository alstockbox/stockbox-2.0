import { aggregateIntelligenceSignals, type IntelligenceSignal } from "./intelligence-common";
import type { AnalysisReport } from "./types";

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function scoreFromRange(value: number, weak: number, strong: number): number {
  if (value <= weak) return 20;
  if (value >= strong) return 90;
  return 20 + ((value - weak) / (strong - weak)) * 70;
}

export type InflectionResult = ReturnType<typeof aggregateIntelligenceSignals> & {
  label: "inflection";
  blockers: string[];
};

export function buildInflectionScore(report: AnalysisReport): InflectionResult {
  const blockers: string[] = [];
  const growth = report.score.dimensions.find((item) => item.key === "growth")?.score ?? null;
  const health = report.score.dimensions.find((item) => item.key === "financialHealth")?.score ?? null;
  const cashFlow = report.score.dimensions.find((item) => item.key === "cashFlow")?.score ?? null;
  const momentum = report.score.dimensions.find((item) => item.key === "momentum")?.score ?? null;
  const operatingMargin = report.metrics.operatingMargin;
  const revenueGrowth = report.metrics.revenueGrowth1y;
  const nextRevenue = report.forwardEstimates?.nextYearRevenueGrowth;
  const nextEps = report.forwardEstimates?.nextYearEpsGrowth;

  const growthQualityScore = finite(operatingMargin) && finite(revenueGrowth)
    ? Math.max(0, Math.min(100, scoreFromRange(revenueGrowth, -0.05, 0.25) * 0.6 + scoreFromRange(operatingMargin, 0.02, 0.22) * 0.4))
    : null;
  const forwardComponents = [nextRevenue, nextEps].filter(finite).map((value) => scoreFromRange(value, -0.05, 0.3));
  const forwardScore = forwardComponents.length
    ? forwardComponents.reduce((sum, value) => sum + value, 0) / forwardComponents.length
    : null;
  const estimatesAvailable = report.providerDiagnostics?.some((item) => item.capability === "estimates" && item.status === "available") ?? false;

  const signals: IntelligenceSignal[] = [
    {
      id: "fundamental-growth",
      label: "Fundamental growth",
      score: finite(growth) ? growth : null,
      weight: 0.28,
      confidence: finite(growth) ? 0.95 : 0,
      source: "StockBox growth dimension",
      family: "fundamental",
    },
    {
      id: "growth-quality",
      label: "Growth quality",
      score: growthQualityScore,
      weight: 0.2,
      confidence: growthQualityScore === null ? 0 : 0.9,
      source: "Revenue growth + operating margin",
      family: "quality",
    },
    {
      id: "forward-expectations",
      label: "Forward expectations",
      score: forwardScore,
      weight: 0.2,
      confidence: forwardScore === null ? 0 : estimatesAvailable ? 0.9 : 0.65,
      source: "Forward estimates",
      family: "expectations",
    },
    {
      id: "price-confirmation",
      label: "Price confirmation",
      score: finite(momentum) ? momentum : null,
      weight: 0.12,
      confidence: finite(momentum) ? 0.9 : 0,
      source: "StockBox momentum dimension",
      family: "market",
    },
    {
      id: "financial-survival",
      label: "Financial survival",
      score: finite(health) ? health : null,
      weight: 0.12,
      confidence: finite(health) ? 0.95 : 0,
      source: "StockBox financial-health dimension",
      family: "risk",
    },
    {
      id: "cash-flow-support",
      label: "Cash-flow support",
      score: finite(cashFlow) ? cashFlow : null,
      weight: 0.08,
      confidence: finite(cashFlow) ? 0.9 : 0,
      source: "StockBox cash-flow dimension",
      family: "fundamental",
    },
  ];

  if (finite(health) && health < 35) {
    blockers.push("Weak financial health materially reduces inflection credibility.");
  }

  const hasFundamentalConfirmation = (finite(growth) && growth >= 50)
    || (finite(revenueGrowth) && revenueGrowth > 0)
    || (finite(nextRevenue) && nextRevenue > 0)
    || (finite(nextEps) && nextEps > 0);
  if (!hasFundamentalConfirmation && finite(momentum) && momentum >= 70) {
    blockers.push("Momentum is not backed by a verified fundamental or estimate inflection.");
  }

  const aggregation = aggregateIntelligenceSignals(signals, { minimumCoverage: 0.45, confidencePenalty: blockers.length ? 0.82 : 1 });
  const score = blockers.some((item) => item.startsWith("Momentum")) && finite(aggregation.score)
    ? Math.min(aggregation.score, 58)
    : blockers.some((item) => item.startsWith("Weak financial")) && finite(aggregation.score)
      ? Math.min(aggregation.score, 52)
      : aggregation.score;

  return { ...aggregation, score, label: "inflection", blockers };
}
