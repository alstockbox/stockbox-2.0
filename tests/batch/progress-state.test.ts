import { describe, expect, it } from "vitest";
import { getBatchProgressState } from "../../src/lib/batch/progress-state";

describe("batch progress state", () => {
  it("reports completed share and the active ticker without inventing progress", () => {
    const state = getBatchProgressState([
      { input: "AMZN", status: "completed" },
      { input: "VISC.ST", status: "failed" },
      { input: "NELLY.ST", status: "completed" },
      { input: "CANTA.ST", status: "running" },
    ]);

    expect(state).toEqual({
      processedCount: 3,
      total: 4,
      progress: 75,
      activeInput: "CANTA.ST",
      isActive: true,
    });
  });

  it("finishes at 100 percent when every row is terminal", () => {
    expect(getBatchProgressState([
      { input: "AMZN", status: "completed" },
      { input: "MSFT", status: "failed" },
    ])).toEqual({
      processedCount: 2,
      total: 2,
      progress: 100,
      activeInput: null,
      isActive: false,
    });
  });
});
