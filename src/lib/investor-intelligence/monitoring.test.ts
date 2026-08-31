import { describe, expect, it } from "vitest";
import { determineMonitoringRefresh } from "./monitoring";

const now = new Date("2026-09-01T12:00:00.000Z");

describe("determineMonitoringRefresh", () => {
  it("always refreshes for an explicit manual request", () => {
    const result = determineMonitoringRefresh({ now, lastAnalysisAt: new Date("2026-09-01T11:55:00.000Z"), triggers: { manual: true } });
    expect(result.shouldRefresh).toBe(true);
    expect(result.reason).toBe("manual_refresh");
  });

  it("refreshes when a new filing or earnings event is known", () => {
    expect(determineMonitoringRefresh({ now, lastAnalysisAt: now, triggers: { newFiling: true } }).shouldRefresh).toBe(true);
    expect(determineMonitoringRefresh({ now, lastAnalysisAt: now, triggers: { newEarnings: true } }).shouldRefresh).toBe(true);
  });

  it("does not rerun expensive analysis merely because an alert depends on a fresh unchanged snapshot", () => {
    const result = determineMonitoringRefresh({
      now,
      lastAnalysisAt: new Date("2026-09-01T10:00:00.000Z"),
      triggers: { alertDependency: true, thesisDependency: true },
      policy: { maxAgeHours: 24 },
    });
    expect(result.shouldRefresh).toBe(false);
    expect(result.reason).toBe("fresh_no_event");
  });

  it("refreshes when the canonical snapshot is stale", () => {
    const result = determineMonitoringRefresh({
      now,
      lastAnalysisAt: new Date("2026-08-30T10:00:00.000Z"),
      triggers: {},
      policy: { maxAgeHours: 24 },
    });
    expect(result.shouldRefresh).toBe(true);
    expect(result.reason).toBe("stale_snapshot");
  });

  it("classifies never-analyzed companies as requiring a first snapshot", () => {
    const result = determineMonitoringRefresh({ now, lastAnalysisAt: null, triggers: {} });
    expect(result.shouldRefresh).toBe(true);
    expect(result.reason).toBe("missing_snapshot");
  });
});
