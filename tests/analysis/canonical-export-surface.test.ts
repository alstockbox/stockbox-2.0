import { describe, expect, it } from "vitest";
import * as analysis from "../../src/lib/analysis";

describe("canonical analysis export surface", () => {
  it.each([
    "recommend",
    "scoreAnalysis",
    "detectRedFlags",
    "detectGreenFlags",
    "buildScenarios",
  ])("does not expose the legacy %s pipeline entry point", (name) => {
    expect(name in analysis).toBe(false);
  });

  it("keeps the canonical pipeline entry points available", () => {
    expect(analysis.analyzeFinancials).toBeTypeOf("function");
    expect(analysis.deriveRecommendation).toBeTypeOf("function");
    expect(analysis.computeScores).toBeTypeOf("function");
  });
});
