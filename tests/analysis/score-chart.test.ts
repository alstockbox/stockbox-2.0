import { describe, expect, it } from "vitest";
import { scoreChartData } from "../../src/components/analysis/score-chart";
import type { ScoreDimension } from "../../src/lib/analysis/types";

function scoreDimension(label: string, score: number | null): ScoreDimension {
  return {
    key: "growth",
    label,
    score,
    rawScore: score,
    adjustedScore: score,
    coverage: score === null ? 0 : 1,
    plannedWeight: 1,
    availableWeight: score === null ? 0 : 1,
    weight: 1,
    contributors: [],
    missingData: [],
  };
}

describe("score chart data", () => {
  it("keeps unavailable dimension scores as null instead of rendering them as zero", () => {
    const data = scoreChartData([
      scoreDimension("Growth", 72),
      scoreDimension("Valuation", null),
    ]);

    expect(data).toEqual([
      { name: "Growth", score: 72, availability: "available" },
      { name: "Valuation", score: null, availability: "unavailable" },
    ]);
  });
});
