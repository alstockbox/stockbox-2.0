import { evaluateAlertCondition, type AlertCondition, type AlertEvaluation } from "./alerts";
import { detectMaterialChanges } from "./materiality";
import { readSnapshotMetric } from "./metrics";
import { evaluateThesis } from "./thesis";
import type {
  CompanyMetricSnapshot,
  MaterialChange,
  ThesisEvaluationResult,
  ThesisRuleDefinition,
  ThesisRuleResultStatus,
  ThesisStatus,
} from "./types";

export type PipelineAlert = { id: string; kind: string; condition: AlertCondition };

export type InvestorIntelligencePipelineResult = {
  thesis: ThesisEvaluationResult | null;
  changes: MaterialChange[];
  alertEvaluations: Array<{ alert: PipelineAlert; evaluation: AlertEvaluation }>;
  triggeredAlerts: Array<{ alert: PipelineAlert; evaluation: AlertEvaluation & { triggerValue: number } }>;
};

export function evaluateInvestorIntelligence(input: {
  previous: CompanyMetricSnapshot | null;
  current: CompanyMetricSnapshot;
  thesis?: {
    currentStatus: ThesisStatus;
    rules: ThesisRuleDefinition[];
    previousResults?: Record<string, ThesisRuleResultStatus>;
  } | null;
  alerts?: PipelineAlert[];
}): InvestorIntelligencePipelineResult {
  const thesis = input.thesis
    ? evaluateThesis({
        currentStatus: input.thesis.currentStatus,
        snapshot: input.current,
        rules: input.thesis.rules,
        previousResults: input.thesis.previousResults,
      })
    : null;

  const failedMetricKeys = new Set(
    thesis?.failed.map((evaluation) => evaluation.metricKey) ?? [],
  );
  const changes = input.previous
    ? detectMaterialChanges({
        previous: input.previous,
        current: input.current,
        thesisFailures: failedMetricKeys,
      })
    : [];

  const alertEvaluations = (input.alerts ?? []).map((alert) => ({
    alert,
    evaluation: evaluateAlertCondition({
      condition: alert.condition,
      previousValue: input.previous ? readSnapshotMetric(input.previous, alert.condition.metricKey) : null,
      currentValue: readSnapshotMetric(input.current, alert.condition.metricKey),
    }),
  }));
  const triggeredAlerts = alertEvaluations.flatMap((item) =>
    item.evaluation.status === "triggered" && item.evaluation.triggerValue !== null
      ? [{ alert: item.alert, evaluation: { ...item.evaluation, triggerValue: item.evaluation.triggerValue } }]
      : [],
  );

  return { thesis, changes, alertEvaluations, triggeredAlerts };
}
