import { describe, expect, it } from "vitest";
import { spearmanRankCorrelation } from "../../src/lib/analysis";

describe("Spearman rank correlation", () => {
  it("returns perfect positive correlation", () => {
    expect(spearmanRankCorrelation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 12);
  });

  it("returns perfect negative correlation", () => {
    expect(spearmanRankCorrelation([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 12);
  });

  it("uses average ranks for ties", () => {
    expect(spearmanRankCorrelation([1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9486832981, 9);
    expect(spearmanRankCorrelation([1, 2, 2, 3], [10, 20, 20, 30])).toBeCloseTo(1, 12);
  });

  it("returns null for a constant vector", () => {
    expect(spearmanRankCorrelation([1, 1, 1], [2, 3, 4])).toBeNull();
  });

  it("returns null for different lengths", () => {
    expect(spearmanRankCorrelation([1, 2], [1])).toBeNull();
  });

  it("returns null for too few or non-finite observations", () => {
    expect(spearmanRankCorrelation([1], [1])).toBeNull();
    expect(spearmanRankCorrelation([1, Number.NaN], [1, 2])).toBeNull();
  });
});
