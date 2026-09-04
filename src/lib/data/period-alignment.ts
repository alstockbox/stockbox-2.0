import type { FinancialPeriod } from "@/lib/analysis/types";

const MAX_PROVIDER_PERIOD_END_GAP_DAYS = 7;

function normalizedPeriodLabel(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function periodKind(period: FinancialPeriod): "annual" | "ttm" | "other" {
  const basis = normalizedPeriodLabel(period.periodBasis);
  const form = normalizedPeriodLabel(period.form);
  if (basis.startsWith("TTM") || form === "TTM") return "ttm";
  if (basis === "FY" || ["FY", "10-K", "20-F", "40-F"].includes(form)) return "annual";
  return "other";
}

function periodEndTime(period: FinancialPeriod): number | null {
  if (!period.periodEndDate) return null;
  const time = Date.parse(`${period.periodEndDate}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

export function periodEndDistanceDays(left: FinancialPeriod, right: FinancialPeriod): number | null {
  const leftTime = periodEndTime(left);
  const rightTime = periodEndTime(right);
  if (leftTime === null || rightTime === null) return null;
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

function economicFiscalYear(period: FinancialPeriod): number | null {
  if (typeof period.fiscalYear === "number" && Number.isFinite(period.fiscalYear)) return period.fiscalYear;
  const endYear = period.periodEndDate ? Number(period.periodEndDate.slice(0, 4)) : Number.NaN;
  return Number.isFinite(endYear) ? endYear : null;
}

export function periodsSemanticallyMatch(left: FinancialPeriod, right: FinancialPeriod): boolean {
  const leftKind = periodKind(left);
  const rightKind = periodKind(right);
  if (leftKind === "other" || rightKind === "other" || leftKind !== rightKind) return false;

  const distanceDays = periodEndDistanceDays(left, right);
  if (distanceDays === null || distanceDays > MAX_PROVIDER_PERIOD_END_GAP_DAYS) return false;

  if (leftKind === "annual") {
    const leftYear = economicFiscalYear(left);
    const rightYear = economicFiscalYear(right);
    return leftYear !== null && rightYear !== null && leftYear === rightYear;
  }

  return true;
}

export function findBestSemanticPeriodMatchIndex(
  target: FinancialPeriod,
  candidates: FinancialPeriod[],
): number {
  return candidates
    .map((candidate, index) => ({ candidate, index, distance: periodEndDistanceDays(target, candidate) ?? Number.POSITIVE_INFINITY }))
    .filter(({ candidate }) => periodsSemanticallyMatch(target, candidate))
    .sort((left, right) => left.distance - right.distance || left.index - right.index)
    .at(0)?.index ?? -1;
}
