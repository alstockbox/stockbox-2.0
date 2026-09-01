import type { AnalysisReport, Metrics } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type MaterialChangeKind =
  | "rating_changed"
  | "score_changed"
  | "personalized_score_changed"
  | "confidence_changed"
  | "coverage_changed"
  | "red_flag_added"
  | "red_flag_removed"
  | "metric_changed"
  | "valuation_changed";

export type MaterialAnalysisChange = {
  kind: MaterialChangeKind;
  severity: "info" | "watch" | "important";
  direction: "supports" | "weakens" | "neutral";
  title: string;
  body: string;
  metric?: string;
  beforeValue?: number | null;
  afterValue?: number | null;
  metadata?: Record<string, unknown>;
};

const ratingRank: Record<AnalysisReport["recommendation"], number> = {
  "Strong Sell": 0,
  Sell: 1,
  Hold: 2,
  Buy: 3,
  "Strong Buy": 4,
  "No Rating": 2,
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function directionFromDelta(delta: number, higherIsBetter: boolean): MaterialAnalysisChange["direction"] {
  if (delta === 0) return "neutral";
  return (delta > 0) === higherIsBetter ? "supports" : "weakens";
}

function numericChange(input: {
  kind: MaterialChangeKind;
  metric: string;
  label: string;
  before: number | null | undefined;
  after: number | null | undefined;
  threshold: number;
  higherIsBetter: boolean;
  importantThreshold?: number;
}): MaterialAnalysisChange | null {
  if (!finite(input.before) || !finite(input.after)) return null;
  const delta = input.after - input.before;
  if (Math.abs(delta) < input.threshold) return null;
  const severity = input.importantThreshold && Math.abs(delta) >= input.importantThreshold
    ? "important" as const
    : "watch" as const;
  const direction = directionFromDelta(delta, input.higherIsBetter);
  return {
    kind: input.kind,
    severity,
    direction,
    title: `${input.label} changed materially`,
    body: `${input.label} moved from ${input.before.toFixed(3)} to ${input.after.toFixed(3)}.`,
    metric: input.metric,
    beforeValue: input.before,
    afterValue: input.after,
    metadata: { delta },
  };
}

const metricRules: Array<{
  key: keyof Metrics;
  label: string;
  threshold: number;
  importantThreshold: number;
  higherIsBetter: boolean;
}> = [
  { key: "revenueGrowth1y", label: "Revenue growth", threshold: 0.05, importantThreshold: 0.15, higherIsBetter: true },
  { key: "operatingMargin", label: "Operating margin", threshold: 0.03, importantThreshold: 0.08, higherIsBetter: true },
  { key: "fcfMargin", label: "Free-cash-flow margin", threshold: 0.03, importantThreshold: 0.08, higherIsBetter: true },
  { key: "cashConversion", label: "Cash conversion", threshold: 0.20, importantThreshold: 0.50, higherIsBetter: true },
  { key: "debtToEquity", label: "Debt to equity", threshold: 0.25, importantThreshold: 0.75, higherIsBetter: false },
  { key: "interestCoverage", label: "Interest coverage", threshold: 2, importantThreshold: 5, higherIsBetter: true },
  { key: "earningsYield", label: "Earnings yield", threshold: 0.02, importantThreshold: 0.05, higherIsBetter: true },
  { key: "fcfYield", label: "FCF yield", threshold: 0.02, importantThreshold: 0.05, higherIsBetter: true },
];

export function deriveMaterialAnalysisChanges(
  previous: AnalysisReport,
  current: AnalysisReport,
): MaterialAnalysisChange[] {
  const changes: MaterialAnalysisChange[] = [];

  if (previous.recommendation !== current.recommendation) {
    const delta = ratingRank[current.recommendation] - ratingRank[previous.recommendation];
    changes.push({
      kind: "rating_changed",
      severity: Math.abs(delta) >= 2 ? "important" : "watch",
      direction: delta > 0 ? "supports" : delta < 0 ? "weakens" : "neutral",
      title: "Model rating changed",
      body: `Model rating changed from ${previous.recommendation} to ${current.recommendation}.`,
      metadata: { before: previous.recommendation, after: current.recommendation },
    });
  }

  const scoreChange = numericChange({
    kind: "score_changed",
    metric: "stockBoxScore",
    label: "StockBox Score",
    before: previous.score.score,
    after: current.score.score,
    threshold: 5,
    importantThreshold: 12,
    higherIsBetter: true,
  });
  if (scoreChange) changes.push(scoreChange);

  const personalizedChange = numericChange({
    kind: "personalized_score_changed",
    metric: "personalizedScore",
    label: "Profile-weighted score",
    before: previous.score.personalizedScore,
    after: current.score.personalizedScore,
    threshold: 5,
    importantThreshold: 12,
    higherIsBetter: true,
  });
  if (personalizedChange) changes.push(personalizedChange);

  const confidenceChange = numericChange({
    kind: "confidence_changed",
    metric: "confidence",
    label: "Confidence",
    before: previous.score.confidence,
    after: current.score.confidence,
    threshold: 10,
    importantThreshold: 25,
    higherIsBetter: true,
  });
  if (confidenceChange) changes.push(confidenceChange);

  const coverageChange = numericChange({
    kind: "coverage_changed",
    metric: "dataCoverage",
    label: "Data coverage",
    before: previous.dataCoverage,
    after: current.dataCoverage,
    threshold: 0.10,
    importantThreshold: 0.25,
    higherIsBetter: true,
  });
  if (coverageChange) changes.push(coverageChange);

  const previousFlags = new Map(previous.redFlags.map((flag) => [flag.title, flag]));
  const currentFlags = new Map(current.redFlags.map((flag) => [flag.title, flag]));
  for (const [title, flag] of currentFlags) {
    if (previousFlags.has(title)) continue;
    changes.push({
      kind: "red_flag_added",
      severity: flag.severity === "critical" || flag.severity === "high" ? "important" : "watch",
      direction: "weakens",
      title: `New red flag: ${flag.title}`,
      body: flag.detail,
      metric: flag.metric,
      metadata: { flagSeverity: flag.severity },
    });
  }
  for (const [title, flag] of previousFlags) {
    if (currentFlags.has(title)) continue;
    changes.push({
      kind: "red_flag_removed",
      severity: flag.severity === "critical" || flag.severity === "high" ? "watch" : "info",
      direction: "supports",
      title: `Red flag cleared: ${flag.title}`,
      body: flag.detail,
      metric: flag.metric,
      metadata: { flagSeverity: flag.severity },
    });
  }

  for (const rule of metricRules) {
    const change = numericChange({
      kind: "metric_changed",
      metric: String(rule.key),
      label: rule.label,
      before: previous.metrics[rule.key],
      after: current.metrics[rule.key],
      threshold: rule.threshold,
      importantThreshold: rule.importantThreshold,
      higherIsBetter: rule.higherIsBetter,
    });
    if (change) changes.push(change);
  }

  if (previous.dcf.suitable && current.dcf.suitable && finite(previous.dcf.base) && finite(current.dcf.base) && previous.dcf.base !== 0) {
    const relativeDelta = (current.dcf.base - previous.dcf.base) / Math.abs(previous.dcf.base);
    if (Math.abs(relativeDelta) >= 0.15) {
      changes.push({
        kind: "valuation_changed",
        severity: Math.abs(relativeDelta) >= 0.30 ? "important" : "watch",
        direction: relativeDelta > 0 ? "supports" : "weakens",
        title: "DCF base value changed materially",
        body: `DCF base value moved from ${previous.dcf.base.toFixed(2)} to ${current.dcf.base.toFixed(2)}.`,
        metric: "dcfBase",
        beforeValue: previous.dcf.base,
        afterValue: current.dcf.base,
        metadata: { relativeDelta },
      });
    }
  }

  return changes.slice(0, 30);
}

export async function recordMaterialAnalysisChangesForPersistedAnalysis(input: {
  userId: string;
  analysisId: string;
  report: AnalysisReport;
}): Promise<{ changes: number; thesisEvents: number }> {
  const admin = createAdminClient();
  if (!admin) return { changes: 0, thesisEvents: 0 };

  const previousResult = await admin.from("analyses")
    .select("id,report")
    .eq("user_id", input.userId)
    .eq("ticker", input.report.ticker)
    .neq("id", input.analysisId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousRow = previousResult.data as { id: string; report: AnalysisReport } | null;
  if (!previousRow) return { changes: 0, thesisEvents: 0 };

  const changes = deriveMaterialAnalysisChanges(previousRow.report, input.report);
  if (!changes.length) return { changes: 0, thesisEvents: 0 };

  const rows = changes.map((change) => ({
    user_id: input.userId,
    ticker: input.report.ticker,
    analysis_id: input.analysisId,
    previous_analysis_id: previousRow.id,
    change_kind: change.kind,
    severity: change.severity,
    direction: change.direction,
    title: change.title,
    body: change.body,
    metric: change.metric ?? null,
    before_value: change.beforeValue ?? null,
    after_value: change.afterValue ?? null,
    metadata: change.metadata ?? {},
  }));
  const inserted = await admin.from("analysis_change_events").insert(rows);
  if (inserted.error) return { changes: 0, thesisEvents: 0 };

  const thesisResult = await admin.from("investment_theses")
    .select("id,status,invalidation_triggers")
    .eq("user_id", input.userId)
    .eq("ticker", input.report.ticker)
    .in("status", ["draft", "active"])
    .maybeSingle();
  const thesis = thesisResult.data as { id: string; status: string; invalidation_triggers: unknown } | null;
  if (!thesis) return { changes: changes.length, thesisEvents: 0 };

  const materialEvidence = changes.filter((change) => change.severity !== "info").slice(0, 12);
  if (materialEvidence.length) {
    await admin.from("thesis_evidence_events").insert(materialEvidence.map((change) => ({
      thesis_id: thesis.id,
      user_id: input.userId,
      analysis_id: input.analysisId,
      event_kind: change.direction,
      title: change.direction === "weakens" && change.severity === "important"
        ? `Review invalidation triggers — ${change.title}`
        : change.title,
      body: change.body,
      evidence: {
        changeKind: change.kind,
        severity: change.severity,
        metric: change.metric ?? null,
        beforeValue: change.beforeValue ?? null,
        afterValue: change.afterValue ?? null,
      },
    })));
  }
  await admin.from("investment_theses").update({
    last_analysis_id: input.analysisId,
  }).eq("id", thesis.id).eq("user_id", input.userId);

  const importantWeakening = materialEvidence.filter(
    (change) => change.severity === "important" && change.direction === "weakens",
  );
  if (importantWeakening.length && thesis.status === "active") {
    await admin.from("notifications").insert({
      user_id: input.userId,
      kind: "thesis_review",
      title: `Review thesis for ${input.report.ticker}`,
      body: `${importantWeakening.length} material weakening signal${importantWeakening.length === 1 ? "" : "s"} changed since the previous saved analysis.`,
      metadata: {
        ticker: input.report.ticker,
        thesisId: thesis.id,
        analysisId: input.analysisId,
        changeKinds: importantWeakening.map((change) => change.kind),
      },
    });
  }
  return { changes: changes.length, thesisEvents: materialEvidence.length };
}
