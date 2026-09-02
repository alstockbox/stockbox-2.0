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
  const signals: IntelligenceSignal[] = [];
  const blockers: string[] = [];
  const growth = report.score.dimensions.find((item) => item.key === "growth")?.score ?? null;
  const health = report.score.dimensions.find((item) => item.key === "financialHealth")?.score ?? null;
  const cashFlow = report.score.dimensions.find((item) => item.key === "cashFlow")?.score ?? null;
  const momentum = report.score.dimensions.find((item) => item.key === "momentum")?.score ?? null;

  if (finite(growth)) {
    signals.push({ id: "fundamental-growth", label: "Fundamental growth", score: growth, weight: 0.28, confidence: 0.95, source: "StockBox growth dimension" });
  }

  const operatingMargin = report.metrics.operatingMargin;
  const revenueGrowth = report.metrics.revenueGrowth1y;
  if (finite(operatingMargin) && finite(revenueGrowth)) {
    const score = Math.max(0, Math.min(100, scoreFromRange(revenueGrowth, -0.05, 0.25) * 0.6 + scoreFromRange(operatingMargin, 0.02, 0.22) * 0.4));
    signals.push({ id: "growth-quality", label: "Growth quality", score, weight: 0.2, confidence: 0.9, source: "Revenue growth + operating margin" });
  }

  const nextRevenue = report.forwardEstimates?.nextYearRevenueGrowth;
  const nextEps = report.forwardEstimates?.nextYearEpsGrowth;
  if (finite(nextRevenue) || finite(nextEps)) {
    const components = [nextRevenue, nextEps].filter(finite).map((value) => scoreFromRange(value, -0.05, 0.3));
    signals.push({
      id: "forward-expectations",
      label: "Forward expectations",
      score: components.reduce((sum, value) => sum + value, 0) / components.length,
      weight: 0.2,
      confidence: report.providerDiagnostics?.some((item) => item.capability === "estimates" && item.status === "available") ? 0.9 : 0.65,
      source: "Forward estimates",
    });
  }

  if (finite(momentum)) {
    signals.push({ id: "price-confirmation", label: "Price confirmation", score: momentum, weight: 0.12, confidence: 0.9, source: "StockBox momentum dimension" });
  }

  if (finite(health)) {
    signals.push({ id: "financial-survival", label: "Financial survival", score: health, weight: 0.12, confidence: 0.95, source: "StockBox financial-health dimension" });
    if (health < 35) blockers.push("Weak financial health materially reduces inflection credibility.");
  }
  if (finite(cashFlow)) {
    signals.push({ id: "cash-flow-support", label: "Cash-flow support", score: cashFlow, weight: 0.08, confidence: 0.9, source: "StockBox cash-flow dimension" });
  }

  const hasFundamentalConfirmation = finite(growth) && growth >= 50 || finite(revenueGrowth) && revenueGrowth > 0 || finite(nextRevenue) && nextRevenue > 0 || finite(nextEps) && nextEps > 0;
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
