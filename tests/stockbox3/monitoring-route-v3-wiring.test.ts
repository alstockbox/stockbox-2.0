import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/app/api/monitoring/run/route.ts"),
  "utf8",
);

describe("Monitoring route V3 wiring", () => {
  it("routes scheduled monitoring through the isolated V3 cycle", () => {
    expect(source).toContain("runMonitoringCycleV3");
    expect(source).toContain("monitoringCycleHttpStatusV3");
    expect(source).not.toContain("runDurableWatchlistMonitoring");
  });

  it("keeps cron authentication and admin authorization boundaries", () => {
    expect(source).toContain("CRON_SECRET");
    expect(source).toContain("isPayoutCronAuthorized");
    expect(source).toContain("await requireAdmin()");
  });

  it("preserves higher bounded limits for explicit admin runs", () => {
    expect(source).toContain("watchlistOptions: { enqueueLimit: 500, workerLimit: 50 }");
    expect(source).toContain("recommendationOutcomeOptions: { enqueueLimit: 500, workerLimit: 50 }");
  });
});
