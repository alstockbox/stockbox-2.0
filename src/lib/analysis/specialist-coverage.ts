export const SPECIALIST_COVERAGE_TARGET = 0.99;

export function specialistCoverageMeetsTarget(coverage: number | null | undefined): boolean {
  return typeof coverage === "number"
    && Number.isFinite(coverage)
    && coverage >= SPECIALIST_COVERAGE_TARGET;
}

export function specialistCoveragePercent(coverage: number | null | undefined): number {
  if (typeof coverage !== "number" || !Number.isFinite(coverage)) return 0;
  return Math.round(Math.max(0, Math.min(1, coverage)) * 1000) / 10;
}

export function specialistCoverageGateMessage(
  label: string,
  coverage: number | null | undefined,
): string | null {
  if (specialistCoverageMeetsTarget(coverage)) return null;
  return `${label} specialist coverage is ${specialistCoveragePercent(coverage)}%, below StockBox's ${(SPECIALIST_COVERAGE_TARGET * 100).toFixed(0)}% verified-data target. The analytical score may be shown for diagnostics, but StockBox must return No Rating until the target is met. Missing values remain N/A; they must never be fabricated, imputed as facts, or replaced with irrelevant corporate metrics.`;
}
