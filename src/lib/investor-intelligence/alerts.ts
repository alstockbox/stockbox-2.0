import { createHash } from "node:crypto";

export type AlertOperator = "below" | "above" | "crosses_below" | "crosses_above" | "change_abs_gte";

export type AlertCondition = {
  metricKey: string;
  operator: AlertOperator;
  threshold: number;
};

export type AlertEvaluation = {
  status: "triggered" | "not_triggered" | "unavailable";
  metricKey: string;
  priorValue: number | null;
  triggerValue: number | null;
  threshold: number;
  reason: string;
};

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function evaluateAlertCondition(input: {
  condition: AlertCondition;
  previousValue: number | null;
  currentValue: number | null;
}): AlertEvaluation {
  const { condition, previousValue, currentValue } = input;
  if (!finite(currentValue)) {
    return {
      status: "unavailable",
      metricKey: condition.metricKey,
      priorValue: finite(previousValue) ? previousValue : null,
      triggerValue: null,
      threshold: condition.threshold,
      reason: "Current metric is unavailable; no alert conclusion was made.",
    };
  }

  const previousAvailable = finite(previousValue);
  let triggered = false;
  let reason = "Alert condition was not met.";

  switch (condition.operator) {
    case "below": {
      const currentState = currentValue < condition.threshold;
      const previousState = previousAvailable ? previousValue < condition.threshold : false;
      triggered = currentState && !previousState;
      reason = triggered
        ? `Metric entered the below-${condition.threshold} alert state.`
        : currentState && previousState
          ? "Alert state was already active on the previous snapshot; duplicate notification suppressed."
          : "Metric is not below the configured threshold.";
      break;
    }
    case "above": {
      const currentState = currentValue > condition.threshold;
      const previousState = previousAvailable ? previousValue > condition.threshold : false;
      triggered = currentState && !previousState;
      reason = triggered
        ? `Metric entered the above-${condition.threshold} alert state.`
        : currentState && previousState
          ? "Alert state was already active on the previous snapshot; duplicate notification suppressed."
          : "Metric is not above the configured threshold.";
      break;
    }
    case "crosses_below":
      triggered = previousAvailable && previousValue >= condition.threshold && currentValue < condition.threshold;
      reason = triggered ? "Metric crossed below the configured threshold." : "No downward threshold crossing occurred.";
      break;
    case "crosses_above":
      triggered = previousAvailable && previousValue <= condition.threshold && currentValue > condition.threshold;
      reason = triggered ? "Metric crossed above the configured threshold." : "No upward threshold crossing occurred.";
      break;
    case "change_abs_gte":
      if (!previousAvailable) {
        return {
          status: "unavailable",
          metricKey: condition.metricKey,
          priorValue: null,
          triggerValue: currentValue,
          threshold: condition.threshold,
          reason: "Previous metric is unavailable; absolute change cannot be calculated.",
        };
      }
      triggered = Math.abs(currentValue - previousValue) >= condition.threshold;
      reason = triggered
        ? `Absolute metric change reached ${Math.abs(currentValue - previousValue)}, meeting the configured threshold.`
        : "Absolute metric change is below the configured threshold.";
      break;
  }

  return {
    status: triggered ? "triggered" : "not_triggered",
    metricKey: condition.metricKey,
    priorValue: previousAvailable ? previousValue : null,
    triggerValue: currentValue,
    threshold: condition.threshold,
    reason,
  };
}

export function buildAlertEventKey(input: {
  alertId: string;
  snapshotId: string;
  metricKey: string;
  priorValue: number | null;
  triggerValue: number | null;
}) {
  return createHash("sha256").update(JSON.stringify({
    alertId: input.alertId,
    snapshotId: input.snapshotId,
    metricKey: input.metricKey,
    priorValue: input.priorValue,
    triggerValue: input.triggerValue,
  })).digest("hex");
}
