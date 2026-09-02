import { describe, expect, it } from "vitest";
import { aggregateIntelligenceEvidence } from "@/lib/analysis/intelligence-common";

describe("aggregateIntelligenceEvidence", () => {
  it("excludes missing evidence from score while counting it against coverage", () => {
    const result = aggregateIntelligenceEvidence([
      { id: "quality", label: "Quality", score: 90, weight: 2, family: "fundamental" },
      { id: "revisions", label: "Revisions", score: null, weight: 1, family: "expectations" },
    ]);
    expect(result.score).toBe(90);
    expect(result.coverage).toBeCloseTo(2 / 3, 8);
    expect(result.availableWeight).toBe(2);
    expect(result.plannedWeight).toBe(3);
    expect(result.availableFamilies).toEqual(["fundamental"]);
  });

  it("returns no directional score below the requested minimum coverage", () => {
    const result = aggregateIntelligenceEvidence([
      { id: "one", label: "One", score: 95, weight: 1, family: "fundamental" },
      { id: "two", label: "Two", score: null, weight: 2, family: "market" },
    ], { minimumCoverage: 0.5 });
    expect(result.coverage).toBeCloseTo(1 / 3, 8);
    expect(result.score).toBeNull();
  });

  it("clamps evidence scores and output to the 0-100 range", () => {
    const result = aggregateIntelligenceEvidence([
      { id: "high", label: "High", score: 140, weight: 1, family: "fundamental" },
      { id: "low", label: "Low", score: -20, weight: 1, family: "market" },
    ]);
    expect(result.score).toBe(50);
  });

  it("ignores non-positive weights instead of letting them distort coverage", () => {
    const result = aggregateIntelligenceEvidence([
      { id: "valid", label: "Valid", score: 80, weight: 1, family: "fundamental" },
      { id: "zero", label: "Zero", score: 10, weight: 0, family: "market" },
      { id: "negative", label: "Negative", score: 10, weight: -2, family: "market" },
    ]);
    expect(result.score).toBe(80);
    expect(result.coverage).toBe(1);
    expect(result.plannedWeight).toBe(1);
  });
});
