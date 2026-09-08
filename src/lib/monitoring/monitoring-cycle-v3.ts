import {
  runDurableWatchlistMonitoring,
  type DurableWatchlistMonitoringResult,
} from "./jobs";
import {
  runDurableRecommendationOutcomeMonitoringV3,
  type DurableRecommendationOutcomeRunV3,
} from "./recommendation-outcome-jobs-v3";

export type MonitoringPipelineResultV3<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type MonitoringCycleV3Result = {
  ok: boolean;
  failed: number;
  watchlist: MonitoringPipelineResultV3<DurableWatchlistMonitoringResult>;
  recommendationOutcomes: MonitoringPipelineResultV3<DurableRecommendationOutcomeRunV3>;
};

type MonitoringCycleDependenciesV3 = {
  runWatchlist?: () => Promise<DurableWatchlistMonitoringResult>;
  runRecommendationOutcomes?: () => Promise<DurableRecommendationOutcomeRunV3>;
};

function errorMessage(reason: unknown): string {
  return reason instanceof Error && reason.message.trim()
    ? reason.message
    : "Unknown monitoring pipeline error.";
}

function internalFailures<T extends { failed: number }>(result: MonitoringPipelineResultV3<T>): number {
  return result.ok ? Math.max(0, result.value.failed) : 1;
}

export async function runMonitoringCycleV3(
  dependencies: MonitoringCycleDependenciesV3 = {},
): Promise<MonitoringCycleV3Result> {
  const runWatchlist = dependencies.runWatchlist ?? (() => runDurableWatchlistMonitoring());
  const runRecommendationOutcomes = dependencies.runRecommendationOutcomes
    ?? (() => runDurableRecommendationOutcomeMonitoringV3());

  const [watchlistSettled, outcomesSettled] = await Promise.allSettled([
    runWatchlist(),
    runRecommendationOutcomes(),
  ]);

  const watchlist: MonitoringCycleV3Result["watchlist"] = watchlistSettled.status === "fulfilled"
    ? { ok: true, value: watchlistSettled.value }
    : { ok: false, error: errorMessage(watchlistSettled.reason) };
  const recommendationOutcomes: MonitoringCycleV3Result["recommendationOutcomes"] = outcomesSettled.status === "fulfilled"
    ? { ok: true, value: outcomesSettled.value }
    : { ok: false, error: errorMessage(outcomesSettled.reason) };

  const failed = internalFailures(watchlist) + internalFailures(recommendationOutcomes);
  return {
    ok: failed === 0,
    failed,
    watchlist,
    recommendationOutcomes,
  };
}
