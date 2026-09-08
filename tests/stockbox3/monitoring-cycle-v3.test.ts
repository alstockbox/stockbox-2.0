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

describe("Monitoring cycle V3", () => {
  it("runs watchlist and recommendation outcome pipelines in one cycle", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockResolvedValue(watchlistOk),
      runRecommendationOutcomes: vi.fn().mockResolvedValue(outcomesOk),
    });

    expect(result.ok).toBe(true);
    expect(result.failed).toBe(0);
    expect(result.watchlist).toEqual(expect.objectContaining({ ok: true, value: watchlistOk }));
    expect(result.recommendationOutcomes).toEqual(expect.objectContaining({ ok: true, value: outcomesOk }));
    expect(monitoringCycleHttpStatusV3(result)).toBe(200);
  });

  it("does not let an outcome failure erase a successful watchlist run", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockResolvedValue(watchlistOk),
      runRecommendationOutcomes: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    });

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.watchlist.ok).toBe(true);
    expect(result.recommendationOutcomes).toEqual({ ok: false, error: "provider unavailable" });
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("does not let a watchlist failure prevent outcome learning", async () => {
    const outcomeRunner = vi.fn().mockResolvedValue(outcomesOk);
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockRejectedValue(new Error("watchlist unavailable")),
      runRecommendationOutcomes: outcomeRunner,
    });

    expect(outcomeRunner).toHaveBeenCalledOnce();
    expect(result.failed).toBe(1);
    expect(result.watchlist).toEqual({ ok: false, error: "watchlist unavailable" });
    expect(result.recommendationOutcomes.ok).toBe(true);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });

  it("returns service unavailable only when both pipelines fail before producing results", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockRejectedValue(new Error("watchlist unavailable")),
      runRecommendationOutcomes: vi.fn().mockRejectedValue(new Error("outcomes unavailable")),
    });

    expect(result.failed).toBe(2);
    expect(monitoringCycleHttpStatusV3(result)).toBe(503);
  });

  it("includes internal failed counts from successful pipeline executions", async () => {
    const result = await runMonitoringCycleV3({
      runWatchlist: vi.fn().mockResolvedValue({ ...watchlistOk, failed: 2 }),
      runRecommendationOutcomes: vi.fn().mockResolvedValue({ ...outcomesOk, failed: 1 }),
    });

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(3);
    expect(monitoringCycleHttpStatusV3(result)).toBe(207);
  });
});
