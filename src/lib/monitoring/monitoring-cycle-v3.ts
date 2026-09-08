import {
  runDurableWatchlistMonitoring,
  type DurableWatchlistMonitoringResult,
} from "./jobs";
import {
  runRecommendationCalibrationEvaluationV3,
  type RecommendationCalibrationEvaluationResultV3,
} from "./recommendation-calibration-evaluation-v3";
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
  calibration: MonitoringPipelineResultV3<RecommendationCalibrationEvaluationResultV3>;
};

type MonitoringCycleDependenciesV3 = {
  runWatchlist?: () => Promise<DurableWatchlistMonitoringResult>;
  runRecommendationOutcomes?: () => Promise<DurableRecommendationOutcomeRunV3>;
  runCalibration?: () => Promise<RecommendationCalibrationEvaluationResultV3>;
};

export type MonitoringCycleV3Options = MonitoringCycleDependenciesV3 & {
  watchlistOptions?: {
    enqueueLimit?: number;
    workerLimit?: number;
    now?: Date;
  };
  recommendationOutcomeOptions?: {
    enqueueLimit?: number;
    workerLimit?: number;
    now?: Date;
  };
  calibrationOptions?: {
    limit?: number;
    minimumBenchmarkSample?: number;
    now?: Date;
  };
};

function errorMessage(reason: unknown): string {
  return reason instanceof Error && reason.message.trim()
    ? reason.message
    : "Unknown monitoring pipeline error.";
}

function internalFailures<T extends { failed: number }>(result: MonitoringPipelineResultV3<T>): number {
  return result.ok ? Math.max(0, result.value.failed) : 1;
}

export function monitoringCycleHttpStatusV3(result: MonitoringCycleV3Result): 200 | 207 | 503 {
  if (result.ok) return 200;
  if (!result.watchlist.ok && !result.recommendationOutcomes.ok && !result.calibration.ok) return 503;
  return 207;
}

export async function runMonitoringCycleV3(
  options: MonitoringCycleV3Options = {},
): Promise<MonitoringCycleV3Result> {
  const runWatchlist = options.runWatchlist
    ?? (() => runDurableWatchlistMonitoring(options.watchlistOptions));
  const runRecommendationOutcomes = options.runRecommendationOutcomes
    ?? (() => runDurableRecommendationOutcomeMonitoringV3(options.recommendationOutcomeOptions));
  const runCalibration = options.runCalibration
    ?? (() => runRecommendationCalibrationEvaluationV3(options.calibrationOptions));

  const [watchlistSettled, outcomesSettled] = await Promise.allSettled([
    runWatchlist(),
    runRecommendationOutcomes(),
  ]);

  // Evaluate after the outcome worker settles so newly persisted outcomes are
  // immediately eligible for drift detection. Calibration remains isolated:
  // its failure cannot erase successful watchlist or outcome work.
  const calibrationSettled = await Promise.allSettled([runCalibration()]);

  const watchlist: MonitoringCycleV3Result["watchlist"] = watchlistSettled.status === "fulfilled"
    ? { ok: true, value: watchlistSettled.value }
    : { ok: false, error: errorMessage(watchlistSettled.reason) };
  const recommendationOutcomes: MonitoringCycleV3Result["recommendationOutcomes"] = outcomesSettled.status === "fulfilled"
    ? { ok: true, value: outcomesSettled.value }
    : { ok: false, error: errorMessage(outcomesSettled.reason) };
  const calibrationResult = calibrationSettled[0];
  if (!calibrationResult) throw new Error("CALIBRATION_PIPELINE_RESULT_MISSING");
  const calibration: MonitoringCycleV3Result["calibration"] = calibrationResult.status === "fulfilled"
    ? { ok: true, value: calibrationResult.value }
    : { ok: false, error: errorMessage(calibrationResult.reason) };

  const failed = internalFailures(watchlist)
    + internalFailures(recommendationOutcomes)
    + internalFailures(calibration);
  return {
    ok: failed === 0,
    failed,
    watchlist,
    recommendationOutcomes,
    calibration,
  };
}
