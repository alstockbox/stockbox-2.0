import { describe, expect, it, vi } from "vitest";
import {
  monitoringCycleHttpStatusV3,
  runMonitoringCycleV3,
} from "@/lib/monitoring/monitoring-cycle-v3";

const watchlistOk = {
  checked: 2,
  baselined: 0,
  changed: 1,
  notified: 1,
  failed: 0,
  queued: 2,
  deduplicated: 0,
  jobsClaimed: 2,
};

const outcomesOk = {
  queued: 3,
  deduplicated: 1,
  failed: 0,
  due: 4,
  jobsClaimed: 3,
  completed: 3,
  workerFailed: 0,
};

const reviewsOk = {
  claimed: 2,
  completed: 2,
  retried: 0,
  failed: 0,
};

const calibrationOk = {
  outcomes: 40,
  performanceSlices: 4,
  driftSlices: 1,
  created: 1,
  refreshed: 0,
  deduplicated: 0,
  failed: 0,
};

function successfulRunners() {
  return {
    runWatchlist: vi.fn().mockResolvedValue(watchlistOk),
    runRecommendationOutcomes: vi.fn().mockResolvedValue(outcomesOk),
    runRecommendationReviews: vi.fn().mockResolvedValue(reviewsOk),
    runCalibration: vi.fn().mockResolvedValue(calibrationOk),
  };
}

describe("Monitoring cycle V3", () => {
  it("runs watchlist, outcome, review and calibration pipelines in one cycle", async () => {
    const result = await runMonitoringCycleV3(successfulRunners());

    expect(result.ok).toBe(true);
    expect(result.failed).toBe(0);
    expect(result.watchlist).toEqual(expect.objectContaining({ ok: true, value: watchlistOk }));
    expect(result.recommendationOutcomes).toEqual(expect.objectContaining({ ok: true, value: outcomesOk }));
    expect(result.recommendationReviews).toEqual(expect.objectContaining({ ok: true, value: reviewsOk }));
    expect(result.calibration).toEqual(expect.objectContaining({ ok: true, value: calibrationOk }));
    expect(monitoringCycleHttpStatusV3(result)).toBe(200);
  });

  it("isolates a review failure from watchlist, outcomes and calibration", async () => {
    const runners = successfulRunners();
    runners.runRecommendationReviews.mockRejectedValue(new Error("review provider unavailable"));
    const result = await runMonitoringCycleV3(runners);

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.watchlist.ok).toBe(true);
    expect(result.recommendationOutcomes.ok).toBe(true);
    expect(result.recommendationReviews).toEqual({ ok: false, error: "review provider unavailable" });
    expect(result.calibration.ok).toBe(true);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("does not let an outcome failure erase successful watchlist, review or calibration work", async () => {
    const runners = successfulRunners();
    runners.runRecommendationOutcomes.mockRejectedValue(new Error("provider unavailable"));
    const result = await runMonitoringCycleV3(runners);

    expect(result.failed).toBe(1);
    expect(result.watchlist.ok).toBe(true);
    expect(result.recommendationReviews.ok).toBe(true);
    expect(result.calibration.ok).toBe(true);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("does not let calibration failure erase collected outcomes or processed reviews", async () => {
    const runners = successfulRunners();
    runners.runCalibration.mockRejectedValue(new Error("calibration unavailable"));
    const result = await runMonitoringCycleV3(runners);

    expect(result.failed).toBe(1);
    expect(result.recommendationOutcomes.ok).toBe(true);
    expect(result.recommendationReviews.ok).toBe(true);
    expect(result.calibration).toEqual({ ok: false, error: "calibration unavailable" });
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("uses 207 for pipeline failures and reserves 503 for coordinator exceptions in the route", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockRejectedValue(new Error("watchlist unavailable")),
      runRecommendationOutcomes: vi.fn().mockRejectedValue(new Error("outcomes unavailable")),
      runRecommendationReviews: vi.fn().mockRejectedValue(new Error("reviews unavailable")),
      runCalibration: vi.fn().mockRejectedValue(new Error("calibration unavailable")),
    });

    expect(result.failed).toBe(4);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("includes internal failed counts from successful pipeline executions", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockResolvedValue({ ...watchlistOk, failed: 2 }),
      runRecommendationOutcomes: vi.fn().mockResolvedValue({ ...outcomesOk, failed: 1 }),
      runRecommendationReviews: vi.fn().mockResolvedValue({ ...reviewsOk, failed: 1 }),
      runCalibration: vi.fn().mockResolvedValue({ ...calibrationOk, failed: 1 }),
    });

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(5);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });
});
