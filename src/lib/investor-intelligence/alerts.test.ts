import { describe, expect, it } from "vitest";
import { buildAlertEventKey, evaluateAlertCondition } from "./alerts";

describe("investment alerts", () => {
  it("triggers a below-threshold alert when the metric enters the alert state", () => {
    const result = evaluateAlertCondition({
      condition: { metricKey: "price", operator: "below", threshold: 100 },
      previousValue: 105,
      currentValue: 95,
    });

    expect(result.status).toBe("triggered");
    expect(result.triggerValue).toBe(95);
  });

  it("does not repeatedly trigger while an unchanged threshold state remains true", () => {
    const result = evaluateAlertCondition({
      condition: { metricKey: "price", operator: "below", threshold: 100 },
      previousValue: 95,
      currentValue: 94,
    });

    expect(result.status).toBe("not_triggered");
    expect(result.reason).toMatch(/already/i);
  });

  it("supports deterministic absolute score-change alerts", () => {
    const result = evaluateAlertCondition({
      condition: { metricKey: "score", operator: "change_abs_gte", threshold: 5 },
      previousValue: 80,
      currentValue: 86,
    });

    expect(result.status).toBe("triggered");
    expect(result.priorValue).toBe(80);
    expect(result.triggerValue).toBe(86);
  });

  it("never turns missing data into an alert conclusion", () => {
    const result = evaluateAlertCondition({
      condition: { metricKey: "fundamentals.roic", operator: "below", threshold: 0.15 },
      previousValue: 0.2,
      currentValue: null,
    });

    expect(result.status).toBe("unavailable");
  });

  it("builds the same event key for the same alert transition so persistence can deduplicate it", () => {
    const first = buildAlertEventKey({ alertId: "a1", snapshotId: "s2", metricKey: "price", priorValue: 105, triggerValue: 95 });
    const second = buildAlertEventKey({ alertId: "a1", snapshotId: "s2", metricKey: "price", priorValue: 105, triggerValue: 95 });
    const different = buildAlertEventKey({ alertId: "a1", snapshotId: "s3", metricKey: "price", priorValue: 95, triggerValue: 90 });

    expect(first).toBe(second);
    expect(first).not.toBe(different);
  });
});
