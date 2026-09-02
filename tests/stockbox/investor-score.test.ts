import { describe, expect, it } from "vitest";
import { calculateInvestorScore } from "../../src/lib/stockbox/investor-score";

describe("stockbox investor score", () => {
  it("does not show a process score before minimum sample size", () => {
    const score = calculateInvestorScore({
      thesisClarity: 90,
      riskAwareness: 90,
      valuationDiscipline: 90,
      positionSizing: 90,
      reviewDiscipline: 90,
      learningConsistency: 90,
      outcomeQuality: 90,
      sampleSize: 2
    });

    expect(score.processScore).toBeNull();
    expect(score.reliability).toBe("insufficient_data");
  });

  it("weights process quality more heavily than outcome", () => {
    const goodProcessBadOutcome = calculateInvestorScore({
      thesisClarity: 82,
      riskAwareness: 80,
      valuationDiscipline: 78,
      positionSizing: 84,
      reviewDiscipline: 76,
      learningConsistency: 72,
      outcomeQuality: 20,
      sampleSize: 12
    });
    const badProcessGoodOutcome = calculateInvestorScore({
      thesisClarity: 35,
      riskAwareness: 30,
      valuationDiscipline: 40,
      positionSizing: 34,
      reviewDiscipline: 28,
      learningConsistency: 45,
      outcomeQuality: 95,
      sampleSize: 12
    });

    expect(goodProcessBadOutcome.processScore).toBeGreaterThan(badProcessGoodOutcome.processScore!);
    expect(goodProcessBadOutcome.reliability).toBe("developing");
  });

  it("clamps invalid score dimensions", () => {
    const score = calculateInvestorScore({
      thesisClarity: 130,
      riskAwareness: -10,
      valuationDiscipline: Number.NaN,
      positionSizing: 50,
      reviewDiscipline: 50,
      learningConsistency: 50,
      outcomeQuality: 50,
      sampleSize: 5
    });

    expect(score.dimensions.thesisClarity).toBe(100);
    expect(score.dimensions.riskAwareness).toBe(0);
    expect(score.dimensions.valuationDiscipline).toBe(0);
  });
});
