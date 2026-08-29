import type { FinancialAnalysisInput, ProviderSourceConflict } from "./types";

const ALWAYS_BLOCKING_SOURCE_CONFLICT_METRICS = new Set([
  "reportingcurrency", "currency", "entityid", "issuerid", "securityid",
  "cik", "isin", "figi", "lei",
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
  if (conflict.severity === "medium") {
    return { conflict, blocking: false, confidenceScore: 70, missingSeverity: "medium", scope: "historical" };
  }

  const metric = normalizedMetric(conflict.metric);
  const latestPeriodEnd = latestSourceConflictComparisonPeriod(input);
  const conflictYear = extractYear(conflict.periodEnd);
  const latestYear = extractYear(latestPeriodEnd);
  const conflictTime = conflict.periodEnd ? Date.parse(conflict.periodEnd) : Number.NaN;
  const latestTime = latestPeriodEnd ? Date.parse(latestPeriodEnd) : Number.NaN;
  const blocks = ALWAYS_BLOCKING_SOURCE_CONFLICT_METRICS.has(metric)
    || !conflict.periodEnd
    || !latestPeriodEnd
    || (
      Number.isFinite(conflictTime) && Number.isFinite(latestTime)
        ? conflictTime >= latestTime
        : conflictYear === null || latestYear === null || conflictYear >= latestYear
    );

  return blocks
    ? { conflict, blocking: true, confidenceScore: 0, missingSeverity: "high", scope: "blocking" }
    : { conflict, blocking: false, confidenceScore: 45, missingSeverity: "medium", scope: "historical" };
}

export function summarizeSourceConflicts(input: FinancialAnalysisInput) {
  const classifications = (input.sourceConflicts ?? []).map((conflict) => classifySourceConflict(conflict, input));
  const blocking = classifications.some((item) => item.blocking);
  const confidenceScore = classifications.length
    ? Math.max(20, Math.min(...classifications.map((item) => item.confidenceScore)) - Math.max(0, classifications.length - 1) * 25)
    : 100;
  return {
    classifications,
    hasConflicts: classifications.length > 0,
    blocking,
    confidenceScore: blocking ? 0 : confidenceScore,
    missingSeverity: blocking ? "high" as const : classifications.length ? "medium" as const : null,
  };
}
