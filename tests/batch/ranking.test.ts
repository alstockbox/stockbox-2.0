import { describe, expect, it } from "vitest";
import { rankBatchResults } from "../../src/lib/batch/ranking";

describe("batch result ranking", () => {
  it("ranks scored reports deterministically and leaves No Rating unranked", () => {
    const ranks = rankBatchResults([
      { key: "A", score: 72, confidence: 80, coverage: 0.9 },
      { key: "B", score: 84, confidence: 65, coverage: 0.8 },
      { key: "C", score: null, confidence: 95, coverage: 1 },
      { key: "D", score: 72, confidence: 70, coverage: 0.95 },
      { key: "E", score: 72, confidence: 80, coverage: 0.85 },
    ]);

    expect(ranks).toEqual({ B: 1, A: 2, E: 3, D: 4, C: null });
  });

  it("uses the stable key as the final tie breaker", () => {
    const ranks = rankBatchResults([
      { key: "MSFT", score: 80, confidence: 80, coverage: 0.9 },
      { key: "AAPL", score: 80, confidence: 80, coverage: 0.9 },
    ]);
    expect(ranks).toEqual({ AAPL: 1, MSFT: 2 });
  });
});