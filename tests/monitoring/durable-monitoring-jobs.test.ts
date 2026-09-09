import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { watchlistJobDedupeKey } from "@/lib/monitoring/jobs";

describe("durable watchlist monitoring jobs", () => {
  it("deduplicates refresh work by canonical ticker", () => {
    expect(watchlistJobDedupeKey(" aapl ")).toBe("watchlist:AAPL");
  });

  it("routes cron execution through the isolated v3 monitoring cycle and durable watchlist queue", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/monitoring/run/route.ts"),
      "utf8",
    );
    const cycle = readFileSync(
      resolve(process.cwd(), "src/lib/monitoring/monitoring-cycle-v3.ts"),
      "utf8",
    );

    expect(route).toContain("runMonitoringCycleV3");
    expect(cycle).toContain("runDurableWatchlistMonitoring");
    expect(route).not.toContain("runOfficialWatchlistMonitoring");
    expect(cycle).not.toContain("runOfficialWatchlistMonitoring");
  });
});
