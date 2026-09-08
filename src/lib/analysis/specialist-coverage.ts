export const SPECIALIST_MIN_RATING_COVERAGE = 0.5;
export const SPECIALIST_HIGH_CONFIDENCE_COVERAGE = 0.8;

/**
 * Backwards-compatible alias for callers that still use the old target name.
 * The product goal is broad instrument coverage, not 99% factor completeness
 * on every single instrument. Missing factors remain explicit N/A values.
 */
export const SPECIALIST_COVERAGE_TARGET = SPECIALIST_MIN_RATING_COVERAGE;

export function specialistCoverageMeetsTarget(coverage: number | null | undefined): boolean {
  return typeof coverage === "number"
    && Number.isFinite(coverage)
    && coverage >= SPECIALIST_MIN_RATING_COVERAGE;
}

export function specialistCoveragePercent(coverage: number | null | undefined): number {
  if (typeof coverage !== "number" || !Number.isFinite(coverage)) return 0;
  return Math.round(Math.max(0, Math.min(1, coverage)) * 1000) / 10;
}

export function specialistCoverageGateMessage(
  label: string,
  coverage: number | null | undefined,
): string | null {
  const coveragePercent = specialistCoveragePercent(coverage);

  if (!specialistCoverageMeetsTarget(coverage)) {
    return `${label} specialist coverage is ${coveragePercent}%, below StockBox's ${(SPECIALIST_MIN_RATING_COVERAGE * 100).toFixed(0)}% minimum verified-factor coverage for a directional rating. The analytical score may be shown for diagnostics, but StockBox must return No Rating until the minimum is met. Missing values remain N/A; they must never be fabricated, imputed as facts, or replaced with irrelevant corporate metrics.`;
  }

  if (typeof coverage === "number" && coverage < SPECIALIST_HIGH_CONFIDENCE_COVERAGE) {
    return `${label} specialist coverage is ${coveragePercent}%. The rating is coverage-limited: StockBox may emit a directional rating because the minimum verified-factor coverage is met, but confidence is reduced and all missing specialist inputs remain explicit N/A values. Missing values are never fabricated or replaced with irrelevant corporate metrics.`;
  }

  return null;
}
