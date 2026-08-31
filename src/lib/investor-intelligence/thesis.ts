import type {
  CompanyMetricSnapshot,
  ThesisEvaluationResult,
  ThesisRuleDefinition,
  ThesisRuleEvaluation,
  ThesisRuleResultStatus,
  ThesisStatus,
} from "./types";

const STATUS_RANK: Record<Exclude<ThesisStatus, "ARCHIVED">, number> = {
  STRONG: 0,
  INTACT: 1,
  WATCH: 2,
  WEAKENING: 3,
  BROKEN: 4,
};

function readMetric(snapshot: CompanyMetricSnapshot, metricKey: string): number | null {
  const parts = metricKey.split(".").filter(Boolean);
  let current: unknown = snapshot;

  for (const part of parts) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function compare(actual: number, rule: ThesisRuleDefinition): boolean {
  const threshold = rule.threshold;
  switch (rule.operator) {
    case "gt":
      return typeof threshold === "number" && actual > threshold;
    case "gte":
      return typeof threshold === "number" && actual >= threshold;
    case "lt":
      return typeof threshold === "number" && actual < threshold;
    case "lte":
      return typeof threshold === "number" && actual <= threshold;
    case "eq":
      return typeof threshold === "number" && actual === threshold;
    case "between":
      return Array.isArray(threshold) && actual >= Math.min(...threshold) && actual <= Math.max(...threshold);
  }
}

function describeThreshold(rule: ThesisRuleDefinition): string {
  const threshold = rule.threshold;
  if (Array.isArray(threshold)) return `${threshold[0]}–${threshold[1]}`;
  const symbol = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", between: "" }[rule.operator];
  return `${symbol} ${threshold}`.trim();
}

function evaluateRule(snapshot: CompanyMetricSnapshot, rule: ThesisRuleDefinition): ThesisRuleEvaluation {
  const actual = readMetric(snapshot, rule.metricKey);
  if (actual === null) {
    return {
      ruleId: rule.id,
      label: rule.label,
      metricKey: rule.metricKey,
      status: "unavailable",
      actual: null,
      operator: rule.operator,
      threshold: rule.threshold,
      critical: rule.critical,
      failureStatus: rule.failureStatus,
      reason: `${rule.label}: metric unavailable; no pass/fail conclusion was made.`,
    };
  }

  const passed = compare(actual, rule);
  return {
    ruleId: rule.id,
    label: rule.label,
    metricKey: rule.metricKey,
    status: passed ? "passed" : "failed",
    actual,
    operator: rule.operator,
    threshold: rule.threshold,
    critical: rule.critical,
    failureStatus: rule.failureStatus,
    reason: passed
      ? `${rule.label}: passed at ${actual} (required ${describeThreshold(rule)}).`
      : `${rule.label}: failed at ${actual} (required ${describeThreshold(rule)}).`,
  };
}

function deriveStatus(currentStatus: ThesisStatus, failed: ThesisRuleEvaluation[]): ThesisStatus {
  if (currentStatus === "ARCHIVED") return "ARCHIVED";
  if (!failed.length) return currentStatus;

  const mostSevereFailure = failed.reduce<Exclude<ThesisStatus, "STRONG" | "INTACT" | "ARCHIVED">>(
    (worst, item) => STATUS_RANK[item.failureStatus] > STATUS_RANK[worst] ? item.failureStatus : worst,
    "WATCH",
  );

  return STATUS_RANK[mostSevereFailure] > STATUS_RANK[currentStatus] ? mostSevereFailure : currentStatus;
}

export function evaluateThesis(input: {
  currentStatus: ThesisStatus;
  snapshot: CompanyMetricSnapshot;
  rules: ThesisRuleDefinition[];
  previousResults?: Record<string, ThesisRuleResultStatus>;
}): ThesisEvaluationResult {
  const evaluations = input.rules.map((rule) => evaluateRule(input.snapshot, rule));
  const passed = evaluations.filter((item) => item.status === "passed");
  const failed = evaluations.filter((item) => item.status === "failed");
  const unavailable = evaluations.filter((item) => item.status === "unavailable");
  const results = Object.fromEntries(evaluations.map((item) => [item.ruleId, item.status])) as Record<string, ThesisRuleResultStatus>;

  const newlyFailed = input.previousResults
    ? failed.filter((item) => input.previousResults?.[item.ruleId] === "passed").map((item) => item.ruleId)
    : [];
  const newlyRecovered = input.previousResults
    ? passed.filter((item) => input.previousResults?.[item.ruleId] === "failed").map((item) => item.ruleId)
    : [];

  const status = deriveStatus(input.currentStatus, failed);
  const reasoning = [
    ...failed.map((item) => item.reason),
    ...unavailable.map((item) => item.reason),
    ...newlyRecovered.map((ruleId) => {
      const item = passed.find((candidate) => candidate.ruleId === ruleId);
      return item ? `${item.label}: recovered from the previous evaluation.` : `${ruleId}: recovered.`;
    }),
  ];

  if (status !== input.currentStatus) {
    reasoning.unshift(`Thesis status changed from ${input.currentStatus} to ${status} because of explicit thesis rule policy.`);
  }

  return { status, passed, failed, unavailable, newlyFailed, newlyRecovered, results, reasoning };
}
