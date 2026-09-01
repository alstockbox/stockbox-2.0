import type {
  AnalysisReport,
  AnalysisSource,
  ResearchEvidence,
  ResearchLayerId,
  ResearchSignal,
} from "@/lib/analysis/types";
import type { TwelveDataEstimateSnapshot, TwelveDataEpsRevision } from "./twelve-data-estimates";

const LAYER_WEIGHTS: Record<ResearchLayerId, number> = {
  fundamental: 0.2,
  valuation: 0.1,
  market: 0.1,
  filings_events: 0.1,
  earnings_expectations: 0.1,
  news_events: 0.1,
  insider_ownership: 0.08,
  industry: 0.08,
  macro: 0.05,
  geopolitical: 0.05,
  positioning: 0.04,
};

function latestSnapshotDate(snapshot: TwelveDataEstimateSnapshot): string | null {
  return [
    ...snapshot.earningsConsensus.map((row) => row.date),
    ...snapshot.revenueConsensus.map((row) => row.date),
    ...snapshot.epsRevisions.map((row) => row.date),
  ].filter((date): date is string => Boolean(date)).sort().at(-1) ?? null;
}

function percent(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : null;
}

function preferredRevision(snapshot: TwelveDataEstimateSnapshot): TwelveDataEpsRevision | null {
  return snapshot.epsRevisions.find((row) => row.period === "next_year")
    ?? snapshot.epsRevisions.find((row) => row.period === "current_year")
    ?? snapshot.epsRevisions[0]
    ?? null;
}

function estimateSource(report: AnalysisReport, snapshot: TwelveDataEstimateSnapshot): AnalysisSource {
  return {
    name: "Twelve Data analyst estimates and EPS revisions",
    url: "https://twelvedata.com/docs",
    accessedAt: report.generatedAt,
    freshness: "Consensus estimates and revision counts are provider observations cached by StockBox; availability depends on the licensed Twelve Data plan.",
    provider: "twelve-data-estimates",
    capability: "estimates",
    dataAsOf: latestSnapshotDate(snapshot),
    version: "twelve-data-estimates-v1",
  };
}

function revisionSignal(revision: TwelveDataEpsRevision | null, evidenceId: string): ResearchSignal | null {
  if (!revision || revision.netLastMonth === 0) return null;
  const direction = revision.netLastMonth > 0 ? "positive" as const : "negative" as const;
  return {
    id: `analyst_revision:eps:${revision.period}:${revision.date ?? "current"}`,
    category: "inflection",
    metric: "epsRevisionNetLastMonth",
    current: revision.netLastMonth,
    previous: null,
    change: revision.netLastMonth,
    periodCurrent: revision.date,
    periodPrevious: null,
    direction,
    confidence: 75,
    evidenceIds: [evidenceId],
    statement: `Analyst EPS revisions for ${revision.period.replaceAll("_", " ")} were net ${revision.netLastMonth > 0 ? "+" : ""}${revision.netLastMonth} over the last month (${revision.upLastMonth} up / ${revision.downLastMonth} down).`,
  };
}

function recalculateResearchCoverage(report: AnalysisReport) {
  const research = report.research;
  if (!research) return;
  research.coverage = research.layers.reduce(
    (sum, layer) => sum + layer.coverage * LAYER_WEIGHTS[layer.layer],
    0,
  );
  research.confidence = Math.round(research.layers.reduce(
    (sum, layer) => sum + layer.confidence * layer.coverage * LAYER_WEIGHTS[layer.layer],
    0,
  ));
}

export function applyTwelveDataEstimateSnapshot(
  report: AnalysisReport,
  snapshot: TwelveDataEstimateSnapshot,
): AnalysisSource {
  report.forwardEstimates = {
    ...(report.forwardEstimates ?? {}),
    ...snapshot.forwardEstimates,
  };

  const source = estimateSource(report, snapshot);
  if (!report.research) return source;

  const evidenceId = `estimate:twelve-data:${source.dataAsOf ?? report.generatedAt}`;
  const evidence: ResearchEvidence = {
    id: evidenceId,
    kind: "external_estimate",
    sourceTier: "financial_provider",
    title: source.name,
    source,
    dataAsOf: source.dataAsOf ?? null,
  };
  if (!report.research.evidence.some((item) => item.id === evidenceId)) {
    report.research.evidence.push(evidence);
  }

  const confidence = Math.round(65 + Math.min(1, snapshot.coverage) * 25);
  const expectationLayer = report.research.layers.find((layer) => layer.layer === "earnings_expectations");
  if (expectationLayer) {
    expectationLayer.status = snapshot.coverage >= 0.999 ? "available" : "partial";
    expectationLayer.coverage = snapshot.coverage;
    expectationLayer.confidence = confidence;
    expectationLayer.dataAsOf = source.dataAsOf ?? null;
    expectationLayer.evidenceIds = [evidenceId];
    expectationLayer.reason = undefined;
  }

  const revision = preferredRevision(snapshot);
  const signal = revisionSignal(revision, evidenceId);
  if (signal && !report.research.signals.some((item) => item.id === signal.id)) {
    report.research.signals.push(signal);
    report.research.changes.push(signal);
    if (signal.direction === "positive") report.research.positives.push(signal);
    if (signal.direction === "negative") report.research.negatives.push(signal);
  }

  const module = report.research.modules.find((item) => item.id === "analyst_expectations");
  if (module) {
    const nextRevenue = percent(snapshot.forwardEstimates.nextYearRevenueGrowth);
    const nextEps = percent(snapshot.forwardEstimates.nextYearEpsGrowth);
    module.status = snapshot.coverage >= 0.999 ? "available" : "partial";
    module.coverage = snapshot.coverage;
    module.confidence = confidence;
    module.dataAsOf = source.dataAsOf ?? null;
    module.findings = [
      ...(nextRevenue ? [{ statement: `Next-year revenue consensus growth is ${nextRevenue}.`, evidenceIds: [evidenceId], confidence }] : []),
      ...(nextEps ? [{ statement: `Next-year EPS consensus growth is ${nextEps}.`, evidenceIds: [evidenceId], confidence }] : []),
      ...(revision ? [{ statement: `EPS revisions for ${revision.period.replaceAll("_", " ")} are net ${revision.netLastMonth > 0 ? "+" : ""}${revision.netLastMonth} over the last month.`, evidenceIds: [evidenceId], confidence: 75 }] : []),
    ];
    module.positiveSignals = revision && revision.netLastMonth > 0 ? [signal?.statement ?? "Positive net EPS revisions."] : [];
    module.negativeSignals = revision && revision.netLastMonth < 0 ? [signal?.statement ?? "Negative net EPS revisions."] : [];
    module.unknowns = [
      ...(nextRevenue ? [] : ["Next-year revenue consensus growth is unavailable or not meaningful."]),
      ...(nextEps ? [] : ["Next-year EPS consensus growth is unavailable or not meaningful."]),
      ...(revision ? [] : ["EPS revision counts are unavailable."]),
    ];
    module.sources = [evidence];
  }

  recalculateResearchCoverage(report);
  return source;
}
