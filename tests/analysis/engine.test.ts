import { describe, expect, it } from "vitest";
import { analyzeFinancials } from "../../src/lib/analysis";
import { durableCompounderInput, missingDataInput } from "./fixtures";

describe("analyzeFinancials", () => {
  it("builds a complete deterministic analysis result", () => {
    const result = analyzeFinancials(durableCompounderInput);

    expect(result.modelVersion).toBe("stockbox-analysis-engine-v0.1.0");
    expect(result.scores.stockBoxScore).toBeGreaterThan(70);
    expect(result.scores.methodology.personalizedWeights).not.toEqual(result.scores.methodology.sectorWeights);
    expect(["Buy", "Strong Buy"]).toContain(result.recommendation.rating);
    expect(result.redFlags).toHaveLength(0);
    expect(result.scenarios.map((scenario) => scenario.name)).toEqual(["Bull", "Base", "Bear"]);
    expect(result.scenarios.every((scenario) => scenario.keyVariables.length > 0)).toBe(true);
  });

  it("keeps missing data visible and avoids high-conviction recommendations", () => {
    const result = analyzeFinancials(missingDataInput);

    expect(result.dcf.status).toBe("unavailable");
    expect(result.missingData.length).toBeGreaterThan(0);
    expect(result.recommendation.rating).not.toBe("Strong Buy");
    expect(result.scores.confidence).toBeLessThan(80);
  });
});
