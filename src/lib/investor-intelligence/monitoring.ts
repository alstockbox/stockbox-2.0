export type MonitoringTriggers = {
  manual?: boolean;
  newFiling?: boolean;
  newEarnings?: boolean;
  newEstimate?: boolean;
  newDividend?: boolean;
  materialPriceMove?: boolean;
  alertDependency?: boolean;
  thesisDependency?: boolean;
};

export type MonitoringRefreshDecision = {
  shouldRefresh: boolean;
  reason: "manual_refresh" | "new_filing" | "new_earnings" | "new_estimate" | "new_dividend" | "material_price_move" | "missing_snapshot" | "stale_snapshot" | "fresh_no_event";
  ageHours: number | null;
};

export function determineMonitoringRefresh(input: {
  now?: Date;
  lastAnalysisAt: Date | null;
  triggers: MonitoringTriggers;
  policy?: { maxAgeHours?: number };
}): MonitoringRefreshDecision {
  const now = input.now ?? new Date();
  const maxAgeHours = Math.max(1, input.policy?.maxAgeHours ?? 24);
  const ageHours = input.lastAnalysisAt ? Math.max(0, (now.getTime() - input.lastAnalysisAt.getTime()) / 3_600_000) : null;

  if (input.triggers.manual) return { shouldRefresh: true, reason: "manual_refresh", ageHours };
  if (input.triggers.newFiling) return { shouldRefresh: true, reason: "new_filing", ageHours };
  if (input.triggers.newEarnings) return { shouldRefresh: true, reason: "new_earnings", ageHours };
  if (input.triggers.newEstimate) return { shouldRefresh: true, reason: "new_estimate", ageHours };
  if (input.triggers.newDividend) return { shouldRefresh: true, reason: "new_dividend", ageHours };
  if (input.triggers.materialPriceMove) return { shouldRefresh: true, reason: "material_price_move", ageHours };
  if (!input.lastAnalysisAt) return { shouldRefresh: true, reason: "missing_snapshot", ageHours: null };
  if (ageHours !== null && ageHours >= maxAgeHours) return { shouldRefresh: true, reason: "stale_snapshot", ageHours };
  return { shouldRefresh: false, reason: "fresh_no_event", ageHours };
}
