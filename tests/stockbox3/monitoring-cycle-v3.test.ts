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

const calibrationOk = {
  outcomes: 40,
  performanceSlices: 4,
  driftSlices: 1,
  created: 1,
  refreshed: 0,
  deduplicated: 0,
  failed: 0,
};

describe("Monitoring cycle V3", () => {
  it("runs watchlist, outcome and calibration pipelines in one cycle", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockResolvedValue(watchlistOk),
      runRecommendationOutcomes: vi.fn().mockResolvedValue(outcomesOk),
      runCalibration: vi.fn().mockResolvedValue(calibrationOk),
    });

    expect(result.ok).toBe(true);
    expect(result.failed).toBe(0);
    expect(result.watchlist).toEqual(expect.objectContaining({ ok: true, value: watchlistOk }));
    expect(result.recommendationOutcomes).toEqual(expect.objectContaining({ ok: true, value: outcomesOk }));
    expect(result.calibration).toEqual(expect.objectContaining({ ok: true, value: calibrationOk }));
    expect(monitoringCycleHttpStatusV3(result)).toBe(200);
  });

  it("does not let an outcome failure erase successful watchlist or calibration work", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockResolvedValue(watchlistOk),
      runRecommendationOutcomes: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      runCalibration: vi.fn().mockResolvedValue(calibrationOk),
    });

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.watchlist.ok).toBe(true);
    expect(result.recommendationOutcomes).toEqual({ ok: false, error: "provider unavailable" });
    expect(result.calibration.ok).toBe(true);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("does not let a watchlist failure prevent recommendation learning", async () => {
    const outcomeRunner = vi.fn().mockResolvedValue(outcomesOk);
    const calibrationRunner = vi.fn().mockResolvedValue(calibrationOk);
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockRejectedValue(new Error("watchlist unavailable")),
      runRecommendationOutcomes: outcomeRunner,
      runCalibration: calibrationRunner,
    });

    expect(outcomeRunner).toHaveBeenCalledOnce();
    expect(calibrationRunner).toHaveBeenCalledOnce();
    expect(result.failed).toBe(1);
    expect(result.watchlist).toEqual({ ok: false, error: "watchlist unavailable" });
    expect(result.recommendationOutcomes.ok).toBe(true);
    expect(result.calibration.ok).toBe(true);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("does not let calibration failure erase collected outcomes", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockResolvedValue(watchlistOk),
      runRecommendationOutcomes: vi.fn().mockResolvedValue(outcomesOk),
      runCalibration: vi.fn().mockRejectedValue(new Error("calibration unavailable")),
    });

    expect(result.failed).toBe(1);
    expect(result.recommendationOutcomes.ok).toBe(true);
    expect(result.calibration).toEqual({ ok: false, error: "calibration unavailable" });
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("returns service unavailable only when every pipeline fails before producing results", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockRejectedValue(new Error("watchlist unavailable")),
      runRecommendationOutcomes: vi.fn().mockRejectedValue(new Error("outcomes unavailable")),
      runCalibration: vi.fn().mockRejectedValue(new Error("calibration unavailable")),
    });

    expect(result.failed).toBe(3);
    expect(monitoringCycleHttpStatusV3(result)).toBe(503);
  });

  it("includes internal failed counts from successful pipeline executions", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockResolvedValue({ ...watchlistOk, failed: 2 }),
      runRecommendationOutcomes: vi.fn().mockResolvedValue({ ...outcomesOk, failed: 1 }),
      runCalibration: vi.fn().mockResolvedValue({ ...calibrationOk, failed: 1 }),
    });

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(4);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });
});
