import { resolveFinancialArchetype } from "./archetypes";
import type { FinancialAnalysisInput, ProviderSourceConflict } from "./types";

const ALWAYS_BLOCKING_SOURCE_CONFLICT_METRICS = new Set([
  "reportingcurrency", "currency", "entityid", "issuerid", "securityid",
  "cik", "isin", "figi", "lei",
]);

const CORPORATE_DECISION_CRITICAL_METRICS = new Set([
  "revenue", "grossprofit", "operatingincome", "ebitda", "netincome",
  "netincomecommonstockholders", "dilutednetincomeavailabletocommon", "epsdiluted",
  "operatingcashflow", "capitalexpenditures", "freecashflow",
  "cashandequivalents", "totaldebt", "totalequity", "totalassets",
  "sharesdiluted", "currentsharesoutstanding",
]);

const BANK_DECISION_CRITICAL_METRICS = new Set([
  "revenue", "netincome", "netincomecommonstockholders",
  "dilutednetincomeavailabletocommon", "epsdiluted",
  "totalequity", "totalassets", "sharesdiluted", "currentsharesoutstanding", "tangiblebookvalue",
]);

const INSURER_DECISION_CRITICAL_METRICS = new Set(BANK_DECISION_CRITICAL_METRICS);
const REIT_DECISION_CRITICAL_METRICS = new Set([
  "revenue", "netincome", "netincomecommonstockholders",
  "dilutednetincomeavailabletocommon", "epsdiluted",
  "totaldebt", "totalequity", "totalassets", "sharesdiluted", "currentsharesoutstanding",
  "fundsfromoperations", "adjustedfundsfromoperations",
]);

export type SourceConflictClassification = {
  conflict: ProviderSourceConflict;
  blocking: boolean;
  confidenceScore: number;
  missingSeverity: "medium" | "high";
  scope: "blocking" | "historical";
};

function normalizedMetric(metric: string) {
  return metric.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function extractYear(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

function latestAnnualPeriodEnd(input: FinancialAnalysisInput): string | null {
  const dated = input.annualPeriods
    .map((period) => period.periodEndDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  if (dated.length) return dated.at(-1)!;

  const latestFiscalYear = Math.max(
    ...input.annualPeriods.map((period) => period.fiscalYear ?? Number.NEGATIVE_INFINITY),
  );
  return Number.isFinite(latestFiscalYear) ? String(latestFiscalYear) : null;
}

export function latestSourceConflictComparisonPeriod(input: FinancialAnalysisInput): string | null {
  return input.trailingTwelveMonths?.periodEndDate ?? latestAnnualPeriodEnd(input);
}

export function classifySourceConflict(
  conflict: ProviderSourceConflict,
  input: FinancialAnalysisInput,
): SourceConflictClassification {
  if (conflict.resolved) {
    return { conflict, blocking: false, confidenceScore: 100, missingSeverity: "medium", scope: "historical" };
  }
  if (conflict.severity === "medium") {
    return { conflict, blocking: false, confidenceScore: 70, missingSeverity: "medium", scope: "historical" };
  }

  const metric = normalizedMetric(conflict.metric);
  const latestPeriodEnd = latestSourceConflictComparisonPeriod(input);
  const conflictYear = extractYear(conflict.periodEnd);
  const latestYear = extractYear(latestPeriodEnd);
  const conflictTime = conflict.periodEnd ? Date.parse(conflict.periodEnd) : Number.NaN;
  const latestTime = latestPeriodEnd ? Date.parse(latestPeriodEnd) : Number.NaN;
  const archetype = resolveFinancialArchetype(input);
  const decisionCriticalMetrics = archetype === "bank"
    ? BANK_DECISION_CRITICAL_METRICS
    : archetype === "insurer"
      ? INSURER_DECISION_CRITICAL_METRICS
      : archetype === "reit"
        ? REIT_DECISION_CRITICAL_METRICS
        : CORPORATE_DECISION_CRITICAL_METRICS;
  const affectsDecisionCriticalFact = decisionCriticalMetrics.has(metric);
  const isLatestOrUndated = !conflict.periodEnd
    || !latestPeriodEnd
    || (
      Number.isFinite(conflictTime) && Number.isFinite(latestTime)
        ? conflictTime >= latestTime
        : conflictYear === null || latestYear === null || conflictYear >= latestYear
    );
  const blocks = ALWAYS_BLOCKING_SOURCE_CONFLICT_METRICS.has(metric)
    || (affectsDecisionCriticalFact && isLatestOrUndated);

  return blocks
    ? { conflict, blocking: true, confidenceScore: 0, missingSeverity: "high", scope: "blocking" }
    : { conflict, blocking: false, confidenceScore: 45, missingSeverity: "medium", scope: "historical" };
}

export function summarizeSourceConflicts(input: FinancialAnalysisInput) {
  const classifications = (input.sourceConflicts ?? []).map((conflict) => classifySourceConflict(conflict, input));
  const active = classifications.filter((item) => !item.conflict.resolved);
  const families = new Map<string, SourceConflictClassification>();
  for (const item of active) {
    const providerPair = [item.conflict.primaryProvider, item.conflict.secondaryProvider].sort().join("|");
    const key = `${normalizedMetric(item.conflict.metric)}|${providerPair}`.toLowerCase();
    const current = families.get(key);
    if (!current || item.blocking || item.confidenceScore < current.confidenceScore) families.set(key, item);
  }
  const independent = [...families.values()];
  const blocking = independent.some((item) => item.blocking);
  const confidenceScore = independent.length
    ? Math.max(20, Math.min(...independent.map((item) => item.confidenceScore)) - Math.max(0, independent.length - 1) * 25)
    : 100;
  return {
    classifications,
    hasConflicts: independent.length > 0,
    blocking,
    confidenceScore: blocking ? 0 : confidenceScore,
    missingSeverity: blocking ? "high" as const : independent.length ? "medium" as const : null,
  };
}
