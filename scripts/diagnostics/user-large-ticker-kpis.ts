import { specialistCoverageMeetsTarget } from "../../src/lib/analysis/specialist-coverage";

export type GlobalAuditKpiInput = {
  query: string;
  status: string;
  securityType: string | null;
  market: string | null;
  specialist: boolean;
  coverage: number | null;
  score: number | null;
  rating: string | null;
};

type AuditRateSummary = {
  input: number;
  discovered: number;
  supported: number;
  completed: number;
  rated: number;
  noRating: number;
  discoveryRate: number | null;
  supportCoverageRate: number | null;
  completionRate: number | null;
  ratingRate: number | null;
  noRatingRate: number | null;
};

type SpecialistSummary = {
  input: number;
  completed: number;
  targetEligible: number;
  meets99PercentCoverage: number;
  coverageTargetRate: number | null;
};

export type GlobalAuditKpis = {
  overall: AuditRateSummary;
  specialist: SpecialistSummary;
  integrity: {
    ratingBelowCoverageTarget: string[];
    noRatingAtOrAboveCoverageTargetWithScore: string[];
  };
  bySecurityType: Record<string, AuditRateSummary>;
  byMarket: Record<string, AuditRateSummary>;
};

const UNDISCOVERED_STATUSES = new Set(["input_invalid", "not_found", "no_exact_match"]);
const UNSUPPORTED_STATUSES = new Set(["unsupported", "unsupported_security_type"]);

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function isDiscovered(item: GlobalAuditKpiInput): boolean {
  return !UNDISCOVERED_STATUSES.has(item.status);
}

function isSupported(item: GlobalAuditKpiInput): boolean {
  return isDiscovered(item) && !UNSUPPORTED_STATUSES.has(item.status);
}

function isCompleted(item: GlobalAuditKpiInput): boolean {
  return item.status === "completed";
}

function isNoRating(item: GlobalAuditKpiInput): boolean {
  return isCompleted(item) && item.rating === "No Rating";
}

function isRated(item: GlobalAuditKpiInput): boolean {
  return isCompleted(item)
    && typeof item.rating === "string"
    && item.rating.trim().length > 0
    && item.rating !== "No Rating";
}

function summarize(items: GlobalAuditKpiInput[]): AuditRateSummary {
  const discovered = items.filter(isDiscovered).length;
  const supported = items.filter(isSupported).length;
  const completed = items.filter(isCompleted).length;
  const rated = items.filter(isRated).length;
  const noRating = items.filter(isNoRating).length;
  return {
    input: items.length,
    discovered,
    supported,
    completed,
    rated,
    noRating,
    discoveryRate: rate(discovered, items.length),
    supportCoverageRate: rate(supported, discovered),
    completionRate: rate(completed, supported),
    ratingRate: rate(rated, completed),
    noRatingRate: rate(noRating, completed),
  };
}

function groupedSummary(
  items: GlobalAuditKpiInput[],
  key: (item: GlobalAuditKpiInput) => string,
): Record<string, AuditRateSummary> {
  const groups = new Map<string, GlobalAuditKpiInput[]>();
  for (const item of items) {
    const bucket = key(item);
    const existing = groups.get(bucket) ?? [];
    existing.push(item);
    groups.set(bucket, existing);
  }
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, members]) => [bucket, summarize(members)]),
  );
}

function finiteCoverage(item: GlobalAuditKpiInput): item is GlobalAuditKpiInput & { coverage: number } {
  return typeof item.coverage === "number" && Number.isFinite(item.coverage);
}

function finiteScore(item: GlobalAuditKpiInput): item is GlobalAuditKpiInput & { score: number } {
  return typeof item.score === "number" && Number.isFinite(item.score);
}

export function buildGlobalAuditKpis(items: GlobalAuditKpiInput[]): GlobalAuditKpis {
  const specialistItems = items.filter((item) => item.specialist);
  const specialistCompleted = specialistItems.filter(isCompleted);
  const targetEligible = specialistCompleted.filter(finiteCoverage);
  const meets99PercentCoverage = targetEligible.filter((item) => specialistCoverageMeetsTarget(item.coverage));

  const ratingBelowCoverageTarget = specialistCompleted
    .filter((item) => isRated(item) && finiteCoverage(item) && !specialistCoverageMeetsTarget(item.coverage))
    .map((item) => item.query)
    .sort();

  const noRatingAtOrAboveCoverageTargetWithScore = specialistCompleted
    .filter((item) => isNoRating(item)
      && finiteCoverage(item)
      && finiteScore(item)
      && specialistCoverageMeetsTarget(item.coverage))
    .map((item) => item.query)
    .sort();

  return {
    overall: summarize(items),
    specialist: {
      input: specialistItems.length,
      completed: specialistCompleted.length,
      targetEligible: targetEligible.length,
      meets99PercentCoverage: meets99PercentCoverage.length,
      coverageTargetRate: rate(meets99PercentCoverage.length, targetEligible.length),
    },
    integrity: {
      ratingBelowCoverageTarget,
      noRatingAtOrAboveCoverageTargetWithScore,
    },
    bySecurityType: groupedSummary(items, (item) => item.securityType?.trim() || "unknown"),
    byMarket: groupedSummary(items, (item) => item.market?.trim() || "unknown"),
  };
}
