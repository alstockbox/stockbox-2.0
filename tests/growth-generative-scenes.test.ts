import { describe, expect, it } from "vitest";
import { planGenerativeScene } from "../src/lib/growth/generative-scenes";

describe("generative growth scene planning", () => {
  it("generates a high-value bounded clip when optional budget allows", () => {
    expect(
      planGenerativeScene({
        monthlySpendSek: 20,
        estimatedCostSek: 1.5,
        durationSeconds: 4,
        valueScore: 90,
      }),
    ).toMatchObject({ action: "generate", durationSeconds: 4 });
  });

  it("falls back when provider cost is unknown", () => {
    expect(
      planGenerativeScene({
        monthlySpendSek: 20,
        estimatedCostSek: null,
        durationSeconds: 3,
        valueScore: 90,
      }),
    ).toMatchObject({ action: "motion_fallback", reason: "unknown_cost" });
  });

  it("falls back when an optional clip would exceed the 50 SEK target", () => {
    expect(
      planGenerativeScene({
        monthlySpendSek: 49.5,
        estimatedCostSek: 1,
        durationSeconds: 3,
        valueScore: 90,
      }),
    ).toMatchObject({ action: "motion_fallback", reason: "target_exceeded" });
  });

  it("falls back at the hard cap", () => {
    expect(
      planGenerativeScene({
        monthlySpendSek: 75,
        estimatedCostSek: 0.2,
        durationSeconds: 3,
        valueScore: 90,
      }),
    ).toMatchObject({ action: "motion_fallback", reason: "hard_cap" });
  });

  it("uses deterministic visuals for low-value scenes", () => {
    expect(
      planGenerativeScene({
        monthlySpendSek: 5,
        estimatedCostSek: 0.1,
        durationSeconds: 3,
        valueScore: 30,
      }),
    ).toMatchObject({ action: "motion_fallback", reason: "low_value" });
  });

  it("limits generated clips to 2-5 seconds", () => {
    expect(
      planGenerativeScene({
        monthlySpendSek: 5,
        estimatedCostSek: 0.1,
        durationSeconds: 8,
        valueScore: 90,
      }).durationSeconds,
    ).toBe(5);
    expect(
      planGenerativeScene({
        monthlySpendSek: 5,
        estimatedCostSek: 0.1,
        durationSeconds: 1,
        valueScore: 90,
      }).durationSeconds,
    ).toBe(2);
  });
});
