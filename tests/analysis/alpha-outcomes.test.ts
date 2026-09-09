import { describe, expect, it } from "vitest";
import {
  evaluateAlphaOutcome,
  selectMaturedOutcomeWindows,
  summarizeAlphaOutcomes,
} from "../../src/lib/alpha/outcomes";

describe("Alpha point-in-time outcomes", () => {
  it("refuses to score a horizon before it has elapsed", () => {
    const outcome = evaluateAlphaOutcome({
      predictionId: "p1",
      predictionAsOf: "2026-01-01T00:00:00.000Z",
      horizonDays: 90,
      priceStart: 100,
      priceEnd: 120,
      marketDataAsOf: "2026-02-15T00:00:00.000Z",
      predictedUp25: 0.45,
    });
    expect(outcome).toBeNull();
  });

  it("uses the stored prediction price and computes realized return without hindsight", () => {
    const outcome = evaluateAlphaOutcome({
      predictionId: "p1",
      predictionAsOf: "2026-01-01T00:00:00.000Z",
      horizonDays: 90,
      priceStart: 100,
      priceEnd: 130,
      marketDataAsOf: "2026-04-02T00:00:00.000Z",
      predictedUp25: 0.55,
      benchmarkReturn: 0.08,
      benchmarkSymbol: "SPY",
    });

    expect(outcome?.observedReturn).toBeCloseTo(0.30, 8);
    expect(outcome?.excessReturn).toBeCloseTo(0.22, 8);
    expect(outcome?.hitUp25).toBe(true);
  });

  it("selects only prediction windows whose horizon has matured but is still inside the observation lag", () => {
    const windows = selectMaturedOutcomeWindows("2026-09-01T12:00:00.000Z", 7);
    const ninety = windows.find((window) => window.horizonDays === 90)!;

    expect(ninety.predictionFrom).toBe("2026-05-27T12:00:00.000Z");
    expect(ninety.predictionTo).toBe("2026-06-03T12:00:00.000Z");
    expect(windows).toHaveLength(4);
  });

  it("summarizes calibration separately from raw return", () => {
    const summary = summarizeAlphaOutcomes([
      { observedReturn: 0.30, predictedUp25: 0.60, hitUp25: true },
      { observedReturn: 0.10, predictedUp25: 0.40, hitUp25: false },
      { observedReturn: -0.05, predictedUp25: 0.20, hitUp25: false },
    ]);

    expect(summary.count).toBe(3);
    expect(summary.hitRateUp25).toBeCloseTo(1 / 3, 8);
    expect(summary.meanPredictedUp25).toBeCloseTo(0.40, 8);
    expect(summary.meanReturn).toBeCloseTo(0.1166666667, 6);
    expect(summary.brierUp25).toBeGreaterThanOrEqual(0);
  });
});
